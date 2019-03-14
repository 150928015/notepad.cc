import * as http from 'http'
import * as Koa from 'koa'
import * as bodyParser from 'koa-bodyparser'
import * as compress from 'koa-compress'
import * as logger from 'koa-logger'
import { config } from './config'
import { error } from './middleware/errorHandler'
import { routes } from './router'
import { wsServer } from './websocket'

const start = () => {
  const app = new Koa()

  app.use(error())
  app.use(logger())
  app.use(compress())
  app.use(bodyParser())
  app.use(routes)

  const httpServer = new http.Server(app.callback())
  wsServer.listen(httpServer)

  const port = config.port
  httpServer.listen(port)
  console.info('Listening on', port)
}

start()
