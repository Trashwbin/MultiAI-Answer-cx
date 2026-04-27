const MULTIAI_GROUP_TITLE = 'MultiAI';
const MULTIAI_GROUP_COLOR: chrome.tabGroups.ColorEnum = 'blue';
const MULTIAI_GROUP_COLLAPSED = false;

async function findMultiAiGroup(windowId: number): Promise<chrome.tabGroups.TabGroup | undefined> {
  const groups = await chrome.tabGroups.query({
    title: MULTIAI_GROUP_TITLE,
    windowId,
  });

  return groups[0];
}

export async function ensureTabGrouped(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  const windowId = tab.windowId;

  const existingGroup = await findMultiAiGroup(windowId);

  if (existingGroup) {
    await chrome.tabs.group({
      groupId: existingGroup.id,
      tabIds: [tabId],
    });

    await chrome.tabGroups.update(existingGroup.id, {
      title: MULTIAI_GROUP_TITLE,
      color: MULTIAI_GROUP_COLOR,
      collapsed: MULTIAI_GROUP_COLLAPSED,
    });
    return;
  }

  const groupId = await chrome.tabs.group({ tabIds: [tabId] });
  await chrome.tabGroups.update(groupId, {
    title: MULTIAI_GROUP_TITLE,
    color: MULTIAI_GROUP_COLOR,
    collapsed: MULTIAI_GROUP_COLLAPSED,
  });
}

export async function createGroupedTab(
  createProperties: chrome.tabs.CreateProperties,
): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.create(createProperties);
  if (tab.id !== undefined) {
    await ensureTabGrouped(tab.id);
  }
  return tab;
}
