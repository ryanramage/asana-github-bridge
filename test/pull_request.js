const test = require('brittle')
const handlePullRequest = require('../handlers/pull_request.js')
const { prStatus } = handlePullRequest

test('prStatus - merged PR', async function (t) {
  const pr = { merged: true, state: 'closed' }
  t.is(prStatus(pr), 'merged', 'should return merged')
})

test('prStatus - closed but not merged', async function (t) {
  const pr = { merged: false, state: 'closed' }
  t.is(prStatus(pr), 'closed', 'should return closed')
})

test('prStatus - open PR', async function (t) {
  const pr = { merged: false, state: 'open' }
  t.is(prStatus(pr), 'open', 'should return open')
})

test('prStatus - no merged field defaults to open', async function (t) {
  const pr = { state: 'open' }
  t.is(prStatus(pr), 'open', 'should return open')
})

test('handlePullRequest - no asana tasks in PR body', async function (t) {
  const payload = {
    action: 'opened',
    pull_request: {
      number: 1,
      body: 'This PR has no Asana links',
      html_url: 'https://github.com/test/repo/pull/1',
      state: 'open',
      merged: false
    },
    repository: {
      full_name: 'test/repo'
    }
  }
  
  const context = {
    config: { asana: {} },
    asanaClient: null
  }
  
  // Should complete without errors
  await handlePullRequest(payload, context)
  t.pass('should handle PR without Asana tasks')
})

test('handlePullRequest - asana tasks but no client (dry-run)', async function (t) {
  const payload = {
    action: 'opened',
    pull_request: {
      number: 1,
      body: 'https://app.asana.com/1/1204330682799323/project/1214250967528549/task/1214250967528551',
      html_url: 'https://github.com/test/repo/pull/1',
      state: 'open',
      merged: false
    },
    repository: {
      full_name: 'test/repo'
    }
  }
  
  const context = {
    config: { asana: {} },
    asanaClient: null
  }
  
  // Should complete without errors in dry-run mode
  await handlePullRequest(payload, context)
  t.pass('should handle dry-run mode')
})

test('handlePullRequest - sync asana tasks successfully', async function (t) {
  t.plan(3)
  
  const payload = {
    action: 'opened',
    pull_request: {
      number: 1,
      body: 'https://app.asana.com/1/1204330682799323/project/1214250967528549/task/1214250967528551',
      html_url: 'https://github.com/test/repo/pull/1',
      state: 'open',
      merged: false
    },
    repository: {
      full_name: 'test/repo'
    }
  }
  
  const mockClient = {
    getTask: async (taskId) => {
      t.is(taskId, '1214250967528551', 'should request correct task')
      return {
        data: {
          gid: taskId,
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
    updateTaskCustomFields: async (taskId, fields) => {
      t.ok(true, 'should update task fields')
      return { data: { gid: taskId } }
    }
  }
  
  const context = {
    config: {
      asana: {
        prUrlFieldGid: 'field-1',
        prUrlFieldName: 'GH PR',
        prMergedFieldGid: 'field-2',
        prMergedFieldName: 'merged',
        prMergedEnumValue: 'Yes'
      }
    },
    asanaClient: mockClient
  }
  
  await handlePullRequest(payload, context)
  t.pass('should complete handler')
})

test('handlePullRequest - multiple asana tasks', async function (t) {
  t.plan(3)
  
  const payload = {
    action: 'opened',
    pull_request: {
      number: 1,
      body: `
        https://app.asana.com/1/1204330682799323/project/1214250967528549/task/1214250967528551
        https://app.asana.com/1/1204330682799323/project/1214250967528549/task/1214250967528552
      `,
      html_url: 'https://github.com/test/repo/pull/1',
      state: 'open',
      merged: false
    },
    repository: {
      full_name: 'test/repo'
    }
  }
  
  const tasksSeen = []
  const mockClient = {
    getTask: async (taskId) => {
      tasksSeen.push(taskId)
      return {
        data: {
          gid: taskId,
          name: 'Test Task',
          custom_fields: []
        }
      }
    },
    updateTaskCustomFields: async (taskId, fields) => {
      return { data: { gid: taskId } }
    }
  }
  
  const context = {
    config: {
      asana: {
        prUrlFieldGid: '',
        prUrlFieldName: 'GH PR',
        prMergedFieldGid: '',
        prMergedFieldName: 'merged',
        prMergedEnumValue: 'Yes'
      }
    },
    asanaClient: mockClient
  }
  
  await handlePullRequest(payload, context)
  
  t.is(tasksSeen.length, 2, 'should process both tasks')
  t.ok(tasksSeen.includes('1214250967528551'), 'should process first task')
  t.ok(tasksSeen.includes('1214250967528552'), 'should process second task')
})

test('handlePullRequest - merged PR completes without error', async function (t) {
  const payload = {
    action: 'closed',
    pull_request: {
      number: 1,
      body: 'https://app.asana.com/1/1204330682799323/project/1214250967528549/task/1214250967528551',
      html_url: 'https://github.com/test/repo/pull/1',
      state: 'closed',
      merged: true
    },
    repository: {
      full_name: 'test/repo'
    }
  }
  
  const mockClient = {
    getTask: async (taskId) => {
      return {
        data: {
          gid: taskId,
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
    },
    updateTaskCustomFields: async (taskId, fields) => {
      return { data: { gid: taskId } }
    }
  }
  
  const context = {
    config: {
      asana: {
        prUrlFieldGid: '',
        prUrlFieldName: 'GH PR',
        prMergedFieldGid: 'field-2',
        prMergedFieldName: 'merged',
        prMergedEnumValue: 'Yes'
      }
    },
    asanaClient: mockClient
  }
  
  // Should handle merged PR without errors
  await handlePullRequest(payload, context)
  t.pass('should handle merged PR')
})

test('handlePullRequest - handles sync errors gracefully', async function (t) {
  t.plan(1)
  
  const payload = {
    action: 'opened',
    pull_request: {
      number: 1,
      body: 'https://app.asana.com/1/1204330682799323/project/1214250967528549/task/1214250967528551',
      html_url: 'https://github.com/test/repo/pull/1',
      state: 'open',
      merged: false
    },
    repository: {
      full_name: 'test/repo'
    }
  }
  
  const mockClient = {
    getTask: async (taskId) => {
      throw new Error('Asana API error')
    },
    updateTaskCustomFields: async (taskId, fields) => {
      return { data: { gid: taskId } }
    }
  }
  
  const context = {
    config: {
      asana: {
        prUrlFieldGid: '',
        prUrlFieldName: 'GH PR',
        prMergedFieldGid: '',
        prMergedFieldName: 'merged',
        prMergedEnumValue: 'Yes'
      }
    },
    asanaClient: mockClient
  }
  
  // Should not throw - errors are caught and logged
  await handlePullRequest(payload, context)
  t.pass('should handle errors gracefully')
})

test('handlePullRequest - missing repository info', async function (t) {
  const payload = {
    action: 'opened',
    pull_request: {
      number: 1,
      body: 'No asana links',
      html_url: 'https://github.com/test/repo/pull/1',
      state: 'open',
      merged: false
    }
    // repository is missing
  }
  
  const context = {
    config: { asana: {} },
    asanaClient: null
  }
  
  // Should handle missing repository gracefully
  await handlePullRequest(payload, context)
  t.pass('should handle missing repository')
})

test('handlePullRequest - missing pull_request object', async function (t) {
  const payload = {
    action: 'opened'
    // pull_request is missing
  }
  
  const context = {
    config: { asana: {} },
    asanaClient: null,
    dontConsoleError: true
  }
  
  // Should handle missing pull_request gracefully
  await handlePullRequest(payload, context)
  t.pass('should handle missing pull_request')
})
