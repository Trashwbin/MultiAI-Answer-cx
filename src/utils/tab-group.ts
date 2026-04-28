const MULTIAI_GROUP_TITLE = 'MultiAI Answer';
const MULTIAI_GROUP_COLOR: chrome.tabGroups.ColorEnum = 'blue';
const MULTIAI_GROUP_COLLAPSED = true;
const inFlightGroups = new Map<number, Promise<number>>();

async function findMultiAiGroups(windowId: number): Promise<chrome.tabGroups.TabGroup[]> {
  const groups = await chrome.tabGroups.query({
    title: MULTIAI_GROUP_TITLE,
    windowId,
  });

  return groups
    .filter((group): group is chrome.tabGroups.TabGroup & { id: number } => group.id !== undefined)
    .sort((a, b) => a.id - b.id);
}

async function mergeDuplicateGroups(
  windowId: number,
  canonicalGroupId: number,
  duplicateGroups: Array<chrome.tabGroups.TabGroup & { id: number }>,
): Promise<void> {
  for (const group of duplicateGroups) {
    if (group.id === canonicalGroupId) continue;

    const tabs = await chrome.tabs.query({
      windowId,
      groupId: group.id,
    });

    const tabIds = tabs
      .map((tab) => tab.id)
      .filter((id): id is number => id !== undefined);

    if (tabIds.length > 0) {
      await chrome.tabs.group({
        groupId: canonicalGroupId,
        tabIds,
      });
    }
  }
}

async function ensureWindowGroup(windowId: number, seedTabId: number): Promise<number> {
  const existing = inFlightGroups.get(windowId);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    const groups = await findMultiAiGroups(windowId);

    if (groups.length > 0) {
      const canonical = groups[0]!;
      await mergeDuplicateGroups(windowId, canonical.id, groups.slice(1));
      await chrome.tabGroups.update(canonical.id, {
        title: MULTIAI_GROUP_TITLE,
        color: MULTIAI_GROUP_COLOR,
        collapsed: MULTIAI_GROUP_COLLAPSED,
      });
      return canonical.id;
    }

    const groupId = await chrome.tabs.group({ tabIds: [seedTabId] });
    await chrome.tabGroups.update(groupId, {
      title: MULTIAI_GROUP_TITLE,
      color: MULTIAI_GROUP_COLOR,
      collapsed: MULTIAI_GROUP_COLLAPSED,
    });
    return groupId;
  })();

  inFlightGroups.set(windowId, task);

  try {
    return await task;
  } finally {
    inFlightGroups.delete(windowId);
  }
}

export async function cleanupAllMultiAiGroups(): Promise<void> {
  const groups = await chrome.tabGroups.query({
    title: MULTIAI_GROUP_TITLE,
  });

  const windowIds = Array.from(
    new Set(
      groups
        .map((group) => group.windowId)
        .filter((windowId): windowId is number => windowId !== undefined),
    ),
  );

  for (const windowId of windowIds) {
    const scopedGroups = await findMultiAiGroups(windowId);
    if (scopedGroups.length <= 1) continue;

    const canonical = scopedGroups[0]!;
    await mergeDuplicateGroups(windowId, canonical.id, scopedGroups.slice(1));
    await chrome.tabGroups.update(canonical.id, {
      title: MULTIAI_GROUP_TITLE,
      color: MULTIAI_GROUP_COLOR,
      collapsed: MULTIAI_GROUP_COLLAPSED,
    });
  }
}

export async function ensureTabGrouped(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  const windowId = tab.windowId;
  const groupId = await ensureWindowGroup(windowId, tabId);

  if (tab.groupId !== groupId) {
    await chrome.tabs.group({
      groupId,
      tabIds: [tabId],
    });
  }

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
