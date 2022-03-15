import { Client } from '@notionhq/client'
import { GetBlockResponse } from '@notionhq/client/build/src/api-endpoints'
import { appEnv } from './app-env'
import { logger } from './logger'
import { getLastElement } from './utils'

export const notionClient = new Client({
  auth: appEnv.notionToken,
})

const INDENT = '    '
const NEWLINE = '\n'

export const notionService = {
  async getPageTitle(pageId: string): Promise<string> {
    const page = await notionClient.pages.retrieve({ page_id: pageId })
    // Descriminating union
    if (!('properties' in page)) {
      logger.error(`properties not found in ${page}`)
      return ''
    }
    let title = ''
    for (const property of Object.values(page.properties)) {
      // Descriminating union
      if (property.type !== 'title') continue
      title = property.title.map(x => x.plain_text).join('')
    }
    return title
  },

  async getPageBody(
    pageId: string,
    options = {
      blockCount: 10,
      indent: 0,
      depth: 3,
    }
  ): Promise<string> {
    const blocks = await notionClient.blocks.children.list({
      block_id: pageId,
    })

    let text = ''
    for (const block of blocks.results.slice(0, options.blockCount)) {
      const blockContent = this.getBlockContent(block)
      if (blockContent.length > 0) {
        text += INDENT.repeat(options.indent)
        text += blockContent
        text += NEWLINE
      }

      // Retrieving children content
      if ('has_children' in block && block.has_children && options.depth > 0) {
        text += await this.getPageBody(block.id, {
          blockCount: options.blockCount,
          indent: options.indent + 1,
          depth: options.depth - 1,
        })
      }
    }
    return text
  },

  getBlockContent(block: GetBlockResponse): string {
    if (!('type' in block)) return ''
    switch (block.type) {
      case 'paragraph':
        return block.paragraph.rich_text.map(x => x.plain_text).join('')

      case 'bulleted_list_item':
        return (
          '・' +
          block.bulleted_list_item.rich_text.map(x => x.plain_text).join('')
        )

      case 'numbered_list_item':
        // TODO: We should give sequential numbers for numbered list
        return (
          '・' +
          block.numbered_list_item.rich_text.map(x => x.plain_text).join('')
        )

      default:
        logger.debug(`Unsupported type: ${block.type}`)
        return ''
    }
  },

  isNotionDomain: (domain: string): boolean => {
    return domain.match(/(www\.)?notion.so/) != null
  },

  getPageIdFromUrl: (url: URL): string | undefined => {
    // In case of modal display, pageId is in query 'p'.
    // e.g. https://www.notion.so/example/my-title-571bb99b29e040eb8a46c2f9b7d138af?p=5daca1bba9ce4ed0bf7a5d348ac9a81d
    const queryId = url.searchParams.get('p')
    if (queryId != null) {
      return queryId
    }

    // In case of page display, pageId is the terminal part of the path separated by '-'.
    // e.g. https://www.notion.so/example/my-title-571bb99b29e040eb8a46c2f9b7d138af
    const pathLast = getLastElement(url.pathname.split('/'))
    return getLastElement(pathLast?.split('-') ?? [])
  },
}
