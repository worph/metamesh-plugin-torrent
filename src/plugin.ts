/**
 * Torrent Plugin
 * Parses .torrent files and extracts metadata
 */

import { readFile } from 'fs/promises';
import bencode from 'bencode';
import type { PluginManifest, ProcessRequest, CallbackPayload } from './types.js';
import { MetaCoreClient } from './meta-core-client.js';

export const manifest: PluginManifest = {
    id: 'torrent',
    name: 'Torrent Parser',
    version: '1.0.0',
    description: 'Parses .torrent files and extracts metadata',
    author: 'MetaMesh',
    dependencies: ['file-info'],
    priority: 50,
    color: '#795548',
    defaultQueue: 'fast',
    timeout: 30000,
    schema: {
        announce: { label: 'Primary Tracker', type: 'string', readonly: true },
        'info/name': { label: 'Torrent Name', type: 'string', readonly: true },
        comment: { label: 'Comment', type: 'string', readonly: true },
        createdBy: { label: 'Created By', type: 'string', readonly: true },
        creationDate: { label: 'Creation Date', type: 'string', readonly: true },
    },
    config: {},
};

export async function process(
    request: ProcessRequest,
    sendCallback: (payload: CallbackPayload) => Promise<void>
): Promise<void> {
    const startTime = Date.now();
    const metaCore = new MetaCoreClient(request.metaCoreUrl);

    try {
        const { cid, filePath, existingMeta } = request;

        if (existingMeta?.fileType !== 'torrent') {
            await sendCallback({
                taskId: request.taskId,
                status: 'skipped',
                duration: Date.now() - startTime,
                reason: 'Not a torrent file',
            });
            return;
        }

        const torrentData = await readFile(filePath);
        const parsed = bencode.decode(torrentData, 'utf8') as Record<string, any>;
        const metadata: Record<string, string> = {};

        // Main announce URL
        const announce = parsed.announce?.toString?.();
        if (announce) metadata.announce = announce;

        // Torrent name
        const name = parsed.info?.name?.toString?.();
        if (name) metadata['info/name'] = name;

        // Optional metadata
        const comment = parsed.comment?.toString?.();
        if (comment) metadata.comment = comment;

        const createdBy = parsed['created by']?.toString?.();
        if (createdBy) metadata.createdBy = createdBy;

        const creationDate = parsed['creation date'];
        if (creationDate != null) {
            metadata.creationDate = String(creationDate);
        }

        // Files info
        const files = parsed.info?.files;
        if (files) {
            let i = 0;
            for (const key in files) {
                const file = files[key];
                const length = file.length;
                const pathParts = file.path;
                const pathStr = Array.isArray(pathParts)
                    ? pathParts.map((p: any) => p.toString()).join('/')
                    : pathParts?.toString?.() || '';

                metadata[`info/files/${i}/length`] = String(length);
                metadata[`info/files/${i}/path`] = pathStr;
                i++;
                if (i > 100) break; // Limit files
            }
        }

        await metaCore.mergeMetadata(cid, metadata);

        // Add announce list to set
        const announceList = parsed['announce-list'] || [];
        for (const tier of announceList) {
            for (const tracker of tier || []) {
                if (tracker) {
                    await metaCore.addToSet(cid, 'announceList', tracker.toString());
                }
            }
        }

        await sendCallback({
            taskId: request.taskId,
            status: 'completed',
            duration: Date.now() - startTime,
        });
    } catch (error) {
        await sendCallback({
            taskId: request.taskId,
            status: 'failed',
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
