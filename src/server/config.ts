import * as path from 'path'

const env = process.env
const isDev = /dev/.test(env.NODE_ENV || '')

const rootDir = isDev
  ? path.resolve(__dirname, '../../')
  : path.resolve(__dirname, '../')

export const config = {
  port: Number(env.PORT || 3333),
  dataDir: path.resolve(rootDir, './data'),
  staticDir: path.resolve(rootDir, './public'),
}
