import chromium from "@sparticuz/chromium";
import {withSpan} from './tracing'
const puppeteer = require('puppeteer-core')

const padding = 0

const getScreenshot = async (pageContent: string, targetId: string) => {
  return withSpan('screenshot', async (parentSpan) => {
    const browser = await withSpan('screenshot.launch_browser', async (span) => {
      const b = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      })
      return b
    })

    const file = await withSpan('screenshot.capture', async (span) => {
      const page = await browser.newPage()
      await page.setContent(pageContent)

      const rect = await page.evaluate((targetId: any) => {
        const element = document.getElementById(targetId)
        const {x, y, width, height} = element.getBoundingClientRect() as DOMRect
        return {left: x, top: y, width, height, id: element.id}
      }, targetId)

      span.setAttribute('screenshot.width', rect.width)
      span.setAttribute('screenshot.height', rect.height)

      return page.screenshot({
        type: 'png',
        omitBackground: true,
        clip: {
          x: rect.left - padding,
          y: rect.top - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        },
      })
    })

    await withSpan('screenshot.close_browser', async () => {
      await browser.close()
    })

    return file
  })
}

export default getScreenshot
