const PLUGIN_ID = "opencode-delegations-sidebar"

const server = async (_input: unknown) => {
  return {}
}

const module = { id: PLUGIN_ID, server }

export const id = PLUGIN_ID
export { server }
export default module
