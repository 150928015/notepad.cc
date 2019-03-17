import * as Router from 'koa-router'
import * as send from 'koa-send'
import * as path from 'path'
import { noteService } from '../service/note'
import { config } from '../config'

const router = new Router()

// use '.all()' here because koa-router's '.use()' is kinda useless
// see: https://github.com/alexmingoia/koa-router/issues/257
router.all('/dist/:file*', async (ctx, next) => {
  try {
    const filePath = ctx.path.replace(/^\/dist/, '')
    await send(ctx, filePath, {
      root: config.staticDir,
    })
  } catch (err) {
    if (err.status !== 404) {
      throw err
    }
  }
})

router.get('/', async function(ctx, next) {
  await ctx.redirect(noteService.genRandomId())
})

router.get('/:id*', async function(ctx, next) {
  await send(ctx, 'index.html', {
    root: config.staticDir,
  })
})

export const routes = router.routes()
