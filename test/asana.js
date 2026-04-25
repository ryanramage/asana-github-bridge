const test = require('brittle')
const { createAsanaClient, syncPrToTask } = require('../lib/asana.js')

// Mock fetch for testing
function mockFetch(responses) {
  const originalFetch = global.fetch
  let callIndex = 0
  
  global.fetch = async (url, options) => {
    const response = responses[callIndex++]
    if (!response) {
      throw new Error(`Unexpected fetch call #${callIndex} to ${url}`)
    }
    
    return {
      ok: response.ok !== false,
      status: response.status || 200,
      statusText: response.statusText || 'OK',
      text: async () => JSON.stringify(response.body || {})
    }
  }
  
  return () => {
    global.fetch = originalFetch
  }
}

test('createAsanaClient - returns null when no token', async function (t) {
  const client = createAsanaClient({ token: '', apiBase: 'https://api.asana.com' })
  t.is(client, null, 'should return null for empty token')
})

test('createAsanaClient - returns null when token is null', async function (t) {
  const client = createAsanaClient({ token: null, apiBase: 'https://api.asana.com' })
  t.is(client, null, 'should return null for null token')
})

test('createAsanaClient - creates client with valid token', async function (t) {
  const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
  t.ok(client, 'should return client object')
  t.ok(typeof client.getTask === 'function', 'should have getTask method')
  t.ok(typeof client.updateTaskCustomFields === 'function', 'should have updateTaskCustomFields method')
})

test('getTask - successful request', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: []
        }
      }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const result = await client.getTask('123')
    
    t.is(result.data.gid, '123', 'should return task data')
    t.is(result.data.name, 'Test Task', 'should return task name')
  } finally {
    cleanup()
  }
})

test('getTask - failed request', async function (t) {
  const cleanup = mockFetch([
    {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      body: { errors: [{ message: 'Task not found' }] }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    await t.exception(async () => await client.getTask('999'), /failed: 404/)
  } finally {
    cleanup()
  }
})

test('updateTaskCustomFields - successful request', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: { data: { gid: '123' } }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const result = await client.updateTaskCustomFields('123', { '456': 'value' })
    
    t.ok(result, 'should return response')
  } finally {
    cleanup()
  }
})

test('syncPrToTask - set empty PR URL field', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: [
            {
              gid: 'field-1',
              name: 'GH PR',
              type: 'text',
              text_value: ''
            }
          ]
        }
      }
    },
    {
      ok: true,
      body: { data: { gid: '123' } }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const task = { taskId: '123' }
    const result = await syncPrToTask(client, task, 'https://github.com/test/pr/1', 'open', {
      prUrlFieldGid: 'field-1',
      prUrlFieldName: 'GH PR',
      prMergedFieldGid: '',
      prMergedFieldName: 'merged',
      prMergedEnumValue: 'Yes'
    })
    
    t.is(result.taskId, '123', 'should return task id')
    t.is(result.taskName, 'Test Task', 'should return task name')
    t.is(result.urlField.action, 'set', 'should set URL field')
    t.is(result.urlField.value, 'https://github.com/test/pr/1', 'should set correct URL')
  } finally {
    cleanup()
  }
})

test('syncPrToTask - skip PR URL field already set to same value', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: [
            {
              gid: 'field-1',
              name: 'GH PR',
              type: 'text',
              text_value: 'https://github.com/test/pr/1'
            }
          ]
        }
      }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const task = { taskId: '123' }
    const result = await syncPrToTask(client, task, 'https://github.com/test/pr/1', 'open', {
      prUrlFieldGid: 'field-1',
      prUrlFieldName: 'GH PR',
      prMergedFieldGid: '',
      prMergedFieldName: 'merged',
      prMergedEnumValue: 'Yes'
    })
    
    t.is(result.urlField.action, 'skip', 'should skip URL field')
    t.is(result.urlField.reason, 'already set to this PR', 'should have correct reason')
  } finally {
    cleanup()
  }
})

test('syncPrToTask - skip PR URL field already set to different value', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: [
            {
              gid: 'field-1',
              name: 'GH PR',
              type: 'text',
              text_value: 'https://github.com/test/pr/2'
            }
          ]
        }
      }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const task = { taskId: '123' }
    const result = await syncPrToTask(client, task, 'https://github.com/test/pr/1', 'open', {
      prUrlFieldGid: 'field-1',
      prUrlFieldName: 'GH PR',
      prMergedFieldGid: '',
      prMergedFieldName: 'merged',
      prMergedEnumValue: 'Yes'
    })
    
    t.is(result.urlField.action, 'skip', 'should skip URL field')
    t.ok(result.urlField.reason.includes('already set to a different value'), 'should have correct reason')
  } finally {
    cleanup()
  }
})

test('syncPrToTask - skip PR URL field not found', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: []
        }
      }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const task = { taskId: '123' }
    const result = await syncPrToTask(client, task, 'https://github.com/test/pr/1', 'open', {
      prUrlFieldGid: 'field-1',
      prUrlFieldName: 'GH PR',
      prMergedFieldGid: '',
      prMergedFieldName: 'merged',
      prMergedEnumValue: 'Yes'
    })
    
    t.is(result.urlField.action, 'skip', 'should skip URL field')
    t.is(result.urlField.reason, 'field not found on task', 'should have correct reason')
  } finally {
    cleanup()
  }
})

test('syncPrToTask - skip PR URL field wrong type', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: [
            {
              gid: 'field-1',
              name: 'GH PR',
              type: 'number'
            }
          ]
        }
      }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const task = { taskId: '123' }
    const result = await syncPrToTask(client, task, 'https://github.com/test/pr/1', 'open', {
      prUrlFieldGid: 'field-1',
      prUrlFieldName: 'GH PR',
      prMergedFieldGid: '',
      prMergedFieldName: 'merged',
      prMergedEnumValue: 'Yes'
    })
    
    t.is(result.urlField.action, 'skip', 'should skip URL field')
    t.ok(result.urlField.reason.includes('expected type=text'), 'should have correct reason')
  } finally {
    cleanup()
  }
})

test('syncPrToTask - set merged field when PR is merged', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: [
            {
              gid: 'field-1',
              name: 'GH PR',
              type: 'text',
              text_value: 'https://github.com/test/pr/1'
            },
            {
              gid: 'field-2',
              name: 'merged',
              type: 'enum',
              enum_options: [
                { gid: 'opt-1', name: 'Yes' },
                { gid: 'opt-2', name: 'No' }
              ],
              enum_value: null
            }
          ]
        }
      }
    },
    {
      ok: true,
      body: { data: { gid: '123' } }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const task = { taskId: '123' }
    const result = await syncPrToTask(client, task, 'https://github.com/test/pr/1', 'merged', {
      prUrlFieldGid: 'field-1',
      prUrlFieldName: 'GH PR',
      prMergedFieldGid: 'field-2',
      prMergedFieldName: 'merged',
      prMergedEnumValue: 'Yes'
    })
    
    t.is(result.mergedField.action, 'set', 'should set merged field')
    t.is(result.mergedField.value, 'Yes', 'should set correct value')
  } finally {
    cleanup()
  }
})

test('syncPrToTask - skip merged field when PR not merged', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: [
            {
              gid: 'field-2',
              name: 'merged',
              type: 'enum',
              enum_options: [
                { gid: 'opt-1', name: 'Yes' }
              ]
            }
          ]
        }
      }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const task = { taskId: '123' }
    const result = await syncPrToTask(client, task, 'https://github.com/test/pr/1', 'open', {
      prUrlFieldGid: '',
      prUrlFieldName: 'GH PR',
      prMergedFieldGid: 'field-2',
      prMergedFieldName: 'merged',
      prMergedEnumValue: 'Yes'
    })
    
    t.is(result.mergedField.action, 'skip', 'should skip merged field')
    t.ok(result.mergedField.reason.includes('not merged'), 'should have correct reason')
  } finally {
    cleanup()
  }
})

test('syncPrToTask - skip merged field already set', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: [
            {
              gid: 'field-2',
              name: 'merged',
              type: 'enum',
              enum_options: [
                { gid: 'opt-1', name: 'Yes' }
              ],
              enum_value: { gid: 'opt-1', name: 'Yes' }
            }
          ]
        }
      }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const task = { taskId: '123' }
    const result = await syncPrToTask(client, task, 'https://github.com/test/pr/1', 'merged', {
      prUrlFieldGid: '',
      prUrlFieldName: 'GH PR',
      prMergedFieldGid: 'field-2',
      prMergedFieldName: 'merged',
      prMergedEnumValue: 'Yes'
    })
    
    t.is(result.mergedField.action, 'skip', 'should skip merged field')
    t.ok(result.mergedField.reason.includes('already set'), 'should have correct reason')
  } finally {
    cleanup()
  }
})

test('syncPrToTask - skip merged field enum option not found', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: [
            {
              gid: 'field-2',
              name: 'merged',
              type: 'enum',
              enum_options: [
                { gid: 'opt-1', name: 'No' }
              ]
            }
          ]
        }
      }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const task = { taskId: '123' }
    const result = await syncPrToTask(client, task, 'https://github.com/test/pr/1', 'merged', {
      prUrlFieldGid: '',
      prUrlFieldName: 'GH PR',
      prMergedFieldGid: 'field-2',
      prMergedFieldName: 'merged',
      prMergedEnumValue: 'Yes'
    })
    
    t.is(result.mergedField.action, 'skip', 'should skip merged field')
    t.ok(result.mergedField.reason.includes('not defined'), 'should have correct reason')
  } finally {
    cleanup()
  }
})

test('syncPrToTask - find field by name when gid not matched', async function (t) {
  const cleanup = mockFetch([
    {
      ok: true,
      body: {
        data: {
          gid: '123',
          name: 'Test Task',
          custom_fields: [
            {
              gid: 'field-999',
              name: 'GH PR',
              type: 'text',
              text_value: ''
            }
          ]
        }
      }
    },
    {
      ok: true,
      body: { data: { gid: '123' } }
    }
  ])
  
  try {
    const client = createAsanaClient({ token: 'test-token', apiBase: 'https://api.asana.com' })
    const task = { taskId: '123' }
    const result = await syncPrToTask(client, task, 'https://github.com/test/pr/1', 'open', {
      prUrlFieldGid: 'wrong-gid',
      prUrlFieldName: 'GH PR',
      prMergedFieldGid: '',
      prMergedFieldName: 'merged',
      prMergedEnumValue: 'Yes'
    })
    
    t.is(result.urlField.action, 'set', 'should find field by name and set it')
  } finally {
    cleanup()
  }
})
