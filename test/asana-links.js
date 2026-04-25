const test = require('brittle')
const { extractAsanaTasks } = require('../lib/asana-links.js')

test('basic', async function (t) {
  const prText = `this is a test description
    https://app.asana.com/1/1204330682799323/project/1214250967528549/task/1214250967528551

    more text about the pr
  `
  const links = extractAsanaTasks(prText)
  t.alike(links.length, 1, 'one asana ticket')
  const link = links[0]
  t.alike(link.workspaceId, '1204330682799323', 'workspaceId')
  t.alike(link.projectId, '1214250967528549', 'projectId')
  t.alike(link.taskId, '1214250967528551', 'taskId')
})
