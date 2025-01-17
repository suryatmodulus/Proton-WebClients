import { wait } from '@proton/shared/lib/helpers/promise';
import { TransferCancel } from '@proton/shared/lib/interfaces/drive/transfer';

import { logError } from '../../utils';
import { LinkType } from '../../links';
import { WAIT_TIME } from '../constants';
import {
    LinkDownload,
    DownloadCallbacks,
    DownloadStreamControls,
    GetChildrenCallback,
    ChildrenLinkMeta,
} from '../interface';
import { NestedLinkDownload } from './interface';
import ArchiveGenerator from './archiveGenerator';
import ConcurrentIterator from './concurrentIterator';

/**
 * initDownloadLinkFolder prepares controls to download archive of the folder.
 * The folder itself is not part of the archive, all childs are in the root
 * of the archive.
 */
export default function initDownloadLinkFolder(
    link: LinkDownload,
    callbacks: DownloadCallbacks
): DownloadStreamControls {
    const folderLoader = new FolderTreeLoader();
    const concurrentIterator = new ConcurrentIterator();
    const archiveGenerator = new ArchiveGenerator();

    const start = () => {
        folderLoader
            .load(link.shareId, link.linkId, callbacks.getChildren)
            .then((size) => {
                callbacks.onInit?.(size);
            })
            .catch(logError);
        const childrenIterator = folderLoader.iterateAllChildren();
        const linksWithStreamsIterator = concurrentIterator.iterate(childrenIterator, callbacks);
        archiveGenerator
            .writeLinks(linksWithStreamsIterator)
            .then(() => {
                callbacks.onFinish?.();
            })
            .catch(logError);
        return archiveGenerator.stream;
    };

    return {
        start,
        pause: () => concurrentIterator.pause(),
        resume: () => concurrentIterator.resume(),
        cancel: () => {
            folderLoader.cancel();
            archiveGenerator.cancel();
            concurrentIterator.cancel();
        },
    };
}

/**
 * FolderTreeLoader loads recursively the whole tree and iterates over
 * all links with provided parent path for each of them.
 */
export class FolderTreeLoader {
    private done: boolean;

    private links: NestedLinkDownload[];

    private abortController: AbortController;

    constructor() {
        this.done = false;
        this.links = [];
        this.abortController = new AbortController();
    }

    async load(shareId: string, linkId: string, getChildren: GetChildrenCallback): Promise<number> {
        const size = await this.loadHelper(shareId, linkId, getChildren);
        this.done = true;
        return size;
    }

    private async loadHelper(
        shareId: string,
        linkId: string,
        getChildren: GetChildrenCallback,
        parent: string[] = []
    ): Promise<number> {
        if (this.abortController.signal.aborted) {
            throw new TransferCancel({ message: `Transfer canceled` });
        }

        const children = await getChildren(this.abortController.signal, shareId, linkId);
        this.links = [
            ...this.links,
            ...children.map((link) => ({
                parentPath: parent,
                type: link.type,
                shareId,
                linkId: link.linkId,
                name: link.name,
                mimeType: link.mimeType,
                size: link.size,
            })),
        ];
        return Promise.all(
            children.map(async (item: ChildrenLinkMeta) => {
                if (item.type === LinkType.FOLDER) {
                    return this.loadHelper(shareId, item.linkId, getChildren, [...parent, item.name]);
                }
                return item.size;
            })
        ).then((sizes: number[]) => {
            return sizes.reduce((total, size) => total + size, 0);
        });
    }

    async *iterateAllChildren(): AsyncGenerator<NestedLinkDownload> {
        while (!this.done || this.links.length > 0) {
            const link = this.links.shift();
            if (link) {
                yield link;
            } else {
                await wait(WAIT_TIME);
            }
        }
    }

    cancel() {
        this.done = true;
        this.abortController.abort();
    }
}
