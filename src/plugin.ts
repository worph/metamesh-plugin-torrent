/**
 * Torrent Plugin
 *
 * Parses .torrent files and extracts metadata including:
 * - Announce URLs
 * - Torrent name and files
 * - Creation info
 * - Video file metadata from the torrent
 *
 * Matches old TorrentProcessor output:
 * - announce, announceList (add), comment, createdBy, creationDate
 * - info/files/{n}/length, info/files/{n}/path, info/name
 */

import { readFile } from 'fs/promises';
import bencode from 'bencode';
import { FileType, FileNameVideoMetaExtractor, episodePatterns, seasonAndEpisodePatterns, seasonPatterns, extraEpKeyWords, keywordsArray, substringArray, soloEp } from '@metazla/filename-tools';
import type { PluginManifest, ProcessRequest, CallbackPayload } from './types.js';
import { MetaCoreClient } from './meta-core-client.js';

const fileType = new FileType();
const fileNameMetaExtractor = new FileNameVideoMetaExtractor(
    [],
    episodePatterns,
    seasonAndEpisodePatterns,
    seasonPatterns,
    extraEpKeyWords,
    keywordsArray,
    substringArray,
    soloEp
);

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

        // Only process torrent files
        if (existingMeta?.fileType !== 'torrent') {
            await sendCallback({
                taskId: request.taskId,
                status: 'skipped',
                duration: Date.now() - startTime,
                reason: 'Not a torrent file',
            });
            return;
        }

        // Read and parse torrent file
        const torrentData = await readFile(filePath);
        const parsed = bencode.decode(torrentData, 'utf8') as Record<string, any>;
        const metadata: Record<string, string> = {};

        // Getting the filename and try to parse video info
        let fileName = 'undefined';
        try {
            fileName = parsed.info?.name?.toString?.() || 'undefined';
            const torrentFileType = fileType.getFileTypeFromExtension(fileName);
            if (torrentFileType === 'video') {
                // Use the same method as old processor - extract video metadata from torrent name
                const videoMeta = fileNameMetaExtractor.extractVideoFileMetadata(fileName);
                if (videoMeta.originalTitle) metadata.originalTitle = videoMeta.originalTitle;
                if (videoMeta.season) metadata.season = videoMeta.season;
                if (videoMeta.episode) metadata.episode = videoMeta.episode;
                if (videoMeta.movieYear) metadata.movieYear = videoMeta.movieYear;
                if (videoMeta.videoType) metadata.videoType = videoMeta.videoType;
            }
        } catch (e) {
            // Ignore multi-file torrent parsing errors
            console.debug(`[torrent] Could not parse video metadata from torrent name: ${e}`);
        }

        // Extract main announce URL
        const announce = parsed.announce?.toString?.();
        if (announce) {
            metadata.announce = announce;
        }

        // Extract optional metadata
        const comment = parsed.comment?.toString?.();
        if (comment) {
            metadata.comment = comment;
        }

        const createdBy = parsed['created by']?.toString?.();
        if (createdBy) {
            metadata.createdBy = createdBy;
        }

        const creationDate = parsed['creation date'];
        if (creationDate != null) {
            metadata.creationDate = String(creationDate);
        }

        // Extract info section - files
        try {
            const files = parsed.info?.files;
            let i = 0;
            for (const key in files || {}) {
                const file = files[key];
                const length = file.length;
                const pathParts = file.path;
                const pathStr = Array.isArray(pathParts)
                    ? pathParts.map((p: any) => p.toString()).join('/')
                    : pathParts?.toString?.() || '';

                metadata[`info/files/${i}/length`] = String(length);
                metadata[`info/files/${i}/path`] = pathStr;
                i++;
                if (i > 100) break; // Limit files to prevent DoS
            }
        } catch (e) {
            console.debug(`[torrent] Error parsing torrent files: ${e}`);
        }

        // Set torrent name
        const name = parsed.info?.name?.toString?.();
        if (name) {
            metadata['info/name'] = name;
        }

        await metaCore.mergeMetadata(cid, metadata);

        // Extract announce list (trackers) using add for RecordSet
        const announceList = parsed['announce-list'] || [];
        for (const tier of announceList) {
            for (const tracker of tier || []) {
                if (tracker) {
                    await metaCore.addToSet(cid, 'announceList', tracker.toString());
                }
            }
        }

        console.log(`[torrent] Parsed torrent file: ${filePath}`);

        await sendCallback({
            taskId: request.taskId,
            status: 'completed',
            duration: Date.now() - startTime,
        });
    } catch (error) {
        console.error(`[torrent] Error parsing torrent file ${request.filePath}:`, error);
        await sendCallback({
            taskId: request.taskId,
            status: 'failed',
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
