import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { ChevronDown, ChevronRight, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import type { JobCode, JobSite, ScopeBuilderItem, ScopeBuilderProject, ScopeBuilderSection } from '../domain/types';
import type { AdminTimeClockService } from '../services/TimeClockService';

interface AdminScopeBuilderProps {
  service: AdminTimeClockService;
  jobSites: JobSite[];
  jobCodes: JobCode[];
}

type DraftSection = ScopeBuilderSection;
type DraftItem = ScopeBuilderItem;
type DropPosition = 'before' | 'after';
type SectionDropTarget = { id: string; position: DropPosition };
type ItemDropTarget = { sectionId: string; id: string; position: DropPosition };

const makeDraftId = (prefix: string) => `draft-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const sortByOrder = <T extends { sortOrder: number }>(items: T[]) => [...items].sort((a, b) => a.sortOrder - b.sortOrder);
const sectionItemSort = (items: DraftItem[]) => [...items].sort((a, b) => a.sortOrder - b.sortOrder);
const freshDate = () => new Date().toISOString();

export function AdminScopeBuilder({ service, jobSites, jobCodes }: AdminScopeBuilderProps) {
  const [projects, setProjects] = useState<ScopeBuilderProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [selectedJobSiteId, setSelectedJobSiteId] = useState('');
  const [selectedJobCodeId, setSelectedJobCodeId] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ScopeBuilderProject['status']>('draft');
  const [sections, setSections] = useState<DraftSection[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(() => new Set());
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newItemTextBySection, setNewItemTextBySection] = useState<Record<string, string>>({});
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<{ id: string; sectionId: string } | null>(null);
  const [sectionDropTarget, setSectionDropTarget] = useState<SectionDropTarget | null>(null);
  const [itemDropTarget, setItemDropTarget] = useState<ItemDropTarget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const saveInFlightRef = useRef(false);

  const activeJobSites = useMemo(() => jobSites.filter((site) => site.isActive && !site.isArchived), [jobSites]);
  const activeJobCodes = useMemo(() => jobCodes.filter((job) => job.isActive && !job.isArchived), [jobCodes]);
  const jobCodesForSelectedSite = useMemo(
    () => activeJobCodes.filter((job) => job.jobSiteId === selectedJobSiteId),
    [activeJobCodes, selectedJobSiteId],
  );
  const selectedJobSite = activeJobSites.find((site) => site.id === selectedJobSiteId) || null;
  const selectedJobCode = activeJobCodes.find((job) => job.id === selectedJobCodeId) || null;
  const orderedSections = sortByOrder(sections.filter((section) => section.isActive));
  const canSave = Boolean(selectedJobSiteId && selectedJobCodeId && title.trim() && !isSaving && isDirty);

  useEffect(() => {
    let isCancelled = false;
    async function loadProjects() {
      setIsLoading(true);
      setError('');
      try {
        const loadedProjects = await service.listScopeBuilderProjects();
        if (isCancelled) return;
        setProjects(loadedProjects);
        if (loadedProjects[0]) {
          await loadProject(loadedProjects[0].id, loadedProjects);
          return;
        }
        const firstSite = activeJobSites[0];
        const firstJob = firstSite ? activeJobCodes.find((job) => job.jobSiteId === firstSite.id) : null;
        if (firstSite && firstJob) startNewDraft(firstSite.id, firstJob.id);
      } catch (err) {
        if (!isCancelled) setError(err instanceof Error ? err.message : 'Unable to load beta scopes.');
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    void loadProjects();
    return () => {
      isCancelled = true;
    };
  }, []);

  async function loadProject(nextProjectId: string, knownProjects = projects) {
    setIsLoading(true);
    setError('');
    try {
      const data = await service.getScopeBuilderProject({ projectId: nextProjectId });
      setProjectId(data.project.id);
      setSelectedJobSiteId(data.project.jobSiteId);
      setSelectedJobCodeId(data.project.jobCodeId);
      setTitle(data.project.title);
      setNotes(data.project.notes || '');
      setStatus(data.project.status);
      setSections(sortByOrder(data.sections));
      setItems(sectionItemSort(data.items));
      setCollapsedSectionIds(new Set());
      setIsDirty(false);
      setMessage('');
      if (!knownProjects.some((project) => project.id === data.project.id)) {
        setProjects([data.project, ...knownProjects]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load beta scope.');
    } finally {
      setIsLoading(false);
    }
  }

  function startNewDraft(jobSiteId: string, jobCodeId: string) {
    const jobCode = activeJobCodes.find((job) => job.id === jobCodeId);
    setProjectId(makeDraftId('project'));
    setSelectedJobSiteId(jobSiteId);
    setSelectedJobCodeId(jobCodeId);
    setTitle(jobCode?.name || 'New scope');
    setNotes('');
    setStatus('draft');
    setSections([]);
    setItems([]);
    setCollapsedSectionIds(new Set());
    setNewSectionTitle('');
    setNewItemTextBySection({});
    setIsDirty(true);
    setMessage('');
    setError('');
  }

  function selectJobCode(jobCodeId: string) {
    const jobCode = activeJobCodes.find((job) => job.id === jobCodeId);
    if (!jobCode?.jobSiteId) return;
    const existingProject = projects.find((project) => project.jobCodeId === jobCodeId && project.isActive);
    if (existingProject) {
      void loadProject(existingProject.id);
      return;
    }
    startNewDraft(jobCode.jobSiteId, jobCode.id);
  }

  function markDirty() {
    setIsDirty(true);
    setMessage('');
  }

  function updateSection(sectionId: string, patch: Partial<DraftSection>) {
    setSections((current) => current.map((section) => section.id === sectionId ? { ...section, ...patch } : section));
    markDirty();
  }

  function updateItem(itemId: string, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, ...patch } : item));
    markDirty();
  }

  function addSection() {
    const sectionTitle = newSectionTitle.trim();
    if (!sectionTitle) return;
    const nowIso = freshDate();
    const section: DraftSection = {
      id: makeDraftId('section'),
      projectId: projectId || makeDraftId('project'),
      title: sectionTitle,
      sortOrder: (orderedSections.length + 1) * 10,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setSections((current) => [...current, section]);
    setNewSectionTitle('');
    markDirty();
  }

  function addItem(sectionId: string) {
    const itemText = (newItemTextBySection[sectionId] || '').trim();
    if (!itemText) return;
    const nowIso = freshDate();
    const sectionItems = items.filter((item) => item.sectionId === sectionId && item.isActive);
    const item: DraftItem = {
      id: makeDraftId('item'),
      projectId,
      sectionId,
      itemText,
      sortOrder: (sectionItems.length + 1) * 10,
      isComplete: false,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setItems((current) => [...current, item]);
    setNewItemTextBySection((current) => ({ ...current, [sectionId]: '' }));
    markDirty();
  }

  function dropPosition(event: DragEvent<HTMLElement>): DropPosition {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  function clearDragState() {
    setDraggedSectionId(null);
    setDraggedItem(null);
    setSectionDropTarget(null);
    setItemDropTarget(null);
  }

  function onSectionDragOver(event: DragEvent<HTMLElement>, targetSectionId: string, forcedPosition?: DropPosition) {
    if (!draggedSectionId || draggedSectionId === targetSectionId) return;
    event.preventDefault();
    setSectionDropTarget({ id: targetSectionId, position: forcedPosition || dropPosition(event) });
  }

  function onSectionDrop(event: DragEvent<HTMLElement>, targetSectionId: string, forcedPosition?: DropPosition) {
    event.preventDefault();
    if (!draggedSectionId || draggedSectionId === targetSectionId) {
      clearDragState();
      return;
    }
    const position = forcedPosition || sectionDropTarget?.position || dropPosition(event);
    const current = orderedSections;
    const draggedSection = current.find((section) => section.id === draggedSectionId);
    const withoutDragged = current.filter((section) => section.id !== draggedSectionId);
    const targetIndex = withoutDragged.findIndex((section) => section.id === targetSectionId);
    if (!draggedSection || targetIndex < 0) {
      clearDragState();
      return;
    }
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
    const next = [...withoutDragged];
    next.splice(insertIndex, 0, draggedSection);
    setSections((existing) => mergeSectionOrder(existing, next));
    clearDragState();
    markDirty();
  }

  function onItemDragOver(event: DragEvent<HTMLElement>, sectionId: string, targetItemId: string, forcedPosition?: DropPosition) {
    if (!draggedItem || draggedItem.sectionId !== sectionId || draggedItem.id === targetItemId) return;
    event.preventDefault();
    setItemDropTarget({ sectionId, id: targetItemId, position: forcedPosition || dropPosition(event) });
  }

  function onItemDrop(event: DragEvent<HTMLElement>, sectionId: string, targetItemId: string, forcedPosition?: DropPosition) {
    event.preventDefault();
    if (!draggedItem || draggedItem.sectionId !== sectionId || draggedItem.id === targetItemId) {
      clearDragState();
      return;
    }
    const position = forcedPosition || itemDropTarget?.position || dropPosition(event);
    const current = sectionItemSort(items.filter((item) => item.sectionId === sectionId && item.isActive));
    const dragged = current.find((item) => item.id === draggedItem.id);
    const withoutDragged = current.filter((item) => item.id !== draggedItem.id);
    const targetIndex = withoutDragged.findIndex((item) => item.id === targetItemId);
    if (!dragged || targetIndex < 0) {
      clearDragState();
      return;
    }
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
    const next = [...withoutDragged];
    next.splice(insertIndex, 0, dragged);
    setItems((existing) => mergeItemOrder(existing, next, sectionId));
    clearDragState();
    markDirty();
  }

  async function saveChanges() {
    if (!canSave || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await service.saveScopeBuilderProject({
        project: {
          id: projectId,
          jobSiteId: selectedJobSiteId,
          jobCodeId: selectedJobCodeId,
          title,
          notes,
          status,
        },
        sections: orderedSections.map((section, index) => ({ ...section, sortOrder: (index + 1) * 10 })),
        items: items
          .filter((item) => item.isActive)
          .map((item) => ({ ...item })),
      });
      setProjectId(saved.project.id);
      setSelectedJobSiteId(saved.project.jobSiteId);
      setSelectedJobCodeId(saved.project.jobCodeId);
      setTitle(saved.project.title);
      setNotes(saved.project.notes || '');
      setStatus(saved.project.status);
      setSections(sortByOrder(saved.sections));
      setItems(sectionItemSort(saved.items));
      const refreshedProjects = await service.listScopeBuilderProjects();
      setProjects(refreshedProjects);
      setIsDirty(false);
      setMessage('Changes saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save beta scope.');
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
      if (!isSaveShortcut) return;
      event.preventDefault();
      if (!event.repeat) void saveChanges();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const emptyState = !sections.length;

  return (
    <section className="scroll-mt-24 space-y-4" id="scope-builder">
      <div className="flex flex-col gap-3 border-b border-app-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Beta</p>
          <h2 className="mt-1 text-2xl font-black">Scope Builder</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-muted">
            <span className="rounded-full bg-badge-neutral px-2.5 py-1 text-badge-neutral-text">{selectedJobSite?.name || 'No property'}</span>
            <span className="rounded-full bg-badge-neutral px-2.5 py-1 text-badge-neutral-text">{selectedJobCode?.code || 'No code'}</span>
            <span className="rounded-full bg-success-bg px-2.5 py-1 text-success">{status}</span>
          </div>
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-black text-white disabled:opacity-50"
          type="button"
          disabled={!canSave}
          onClick={saveChanges}
          title="Save Changes (Command-S / Ctrl-S)"
          aria-keyshortcuts="Meta+S Control+S"
        >
          <Save size={16} aria-hidden="true" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {error && <div className="rounded-md border border-error-border bg-error-bg p-3 text-sm font-bold text-error-text">{error}</div>}
      {message && (
        <div
          data-scope-builder-message="saved"
          className="rounded-md border p-3 text-sm font-bold"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-accent) 55%, transparent)',
            background: 'color-mix(in srgb, var(--color-accent) 14%, var(--color-card))',
            color: 'var(--color-accent)',
          }}
        >
          {message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="space-y-3 self-start rounded-md border border-app-border bg-card p-4 shadow-soft lg:sticky lg:top-24">
          <label className="block text-sm font-bold text-muted-strong">
            Property
            <select
              className="mt-1 min-h-11 w-full rounded-md border border-input-border bg-input-bg px-3 text-sm font-semibold text-ink"
              value={selectedJobSiteId}
              onChange={(event) => {
                const siteId = event.target.value;
                const firstJob = activeJobCodes.find((job) => job.jobSiteId === siteId);
                setSelectedJobSiteId(siteId);
                if (firstJob) selectJobCode(firstJob.id);
                else {
                  setSelectedJobCodeId('');
                  setProjectId('');
                  setTitle('');
                  setSections([]);
                  setItems([]);
                }
              }}
            >
              {activeJobSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>

          <label className="block text-sm font-bold text-muted-strong">
            Job code
            <select
              className="mt-1 min-h-11 w-full rounded-md border border-input-border bg-input-bg px-3 text-sm font-semibold text-ink"
              value={selectedJobCodeId}
              onChange={(event) => selectJobCode(event.target.value)}
            >
              {jobCodesForSelectedSite.map((job) => (
                <option key={job.id} value={job.id}>{job.code ? `${job.code} - ${job.name}` : job.name}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-bold text-muted-strong">
            Scope title
            <input
              className="mt-1 min-h-11 w-full rounded-md border border-input-border bg-input-bg px-3 text-sm font-semibold text-ink"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                markDirty();
              }}
            />
          </label>

          <label className="block text-sm font-bold text-muted-strong">
            Status
            <select
              className="mt-1 min-h-11 w-full rounded-md border border-input-border bg-input-bg px-3 text-sm font-semibold text-ink"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ScopeBuilderProject['status']);
                markDirty();
              }}
            >
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
            </select>
          </label>

          <label className="block text-sm font-bold text-muted-strong">
            Notes
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-input-border bg-input-bg px-3 py-2 text-sm font-semibold text-ink"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                markDirty();
              }}
            />
          </label>

          <div className="rounded-md border border-app-border-subtle bg-card-alt p-3 text-xs font-bold text-muted">
            {projects.length} beta scope{projects.length === 1 ? '' : 's'} saved
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          {isLoading && <div className="rounded-md border border-app-border bg-card p-5 font-bold text-muted shadow-soft">Loading beta scope...</div>}

          {!isLoading && emptyState && (
            <div className="rounded-md border border-app-border bg-card p-5 shadow-soft">
              <p className="text-sm font-bold text-muted-strong">No sections yet.</p>
            </div>
          )}

          {orderedSections.map((section) => {
            const isCollapsed = collapsedSectionIds.has(section.id);
            const sectionItems = sectionItemSort(items.filter((item) => item.sectionId === section.id && item.isActive));
            const completeCount = sectionItems.filter((item) => item.isComplete).length;
            const showSectionBefore = draggedSectionId && sectionDropTarget?.id === section.id && sectionDropTarget.position === 'before';
            const showSectionAfter = draggedSectionId && sectionDropTarget?.id === section.id && sectionDropTarget.position === 'after';

            return (
              <Fragment key={section.id}>
              {showSectionBefore && (
                <DropPlaceholder
                  kind="section"
                  onDragOver={(event) => onSectionDragOver(event, section.id, 'before')}
                  onDrop={(event) => onSectionDrop(event, section.id, 'before')}
                />
              )}
              <section
                className={`rounded-md border border-app-border bg-card shadow-soft transition ${draggedSectionId === section.id ? 'opacity-75' : ''}`}
                draggable
                onDragStart={() => setDraggedSectionId(section.id)}
                onDragOver={(event) => onSectionDragOver(event, section.id)}
                onDrop={(event) => onSectionDrop(event, section.id)}
                onDragEnd={clearDragState}
              >
                <div className="flex items-center gap-2 border-b border-app-border-subtle p-3">
                  <GripVertical size={18} className="shrink-0 cursor-grab text-muted-light" aria-hidden="true" />
                  <button
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-input-border text-muted"
                    type="button"
                    onClick={() => {
                      setCollapsedSectionIds((current) => {
                        const next = new Set(current);
                        if (next.has(section.id)) next.delete(section.id);
                        else next.add(section.id);
                        return next;
                      });
                    }}
                    aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
                  >
                    {isCollapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                  </button>
                  <input
                    className="min-h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-base font-black text-ink focus:border-input-border focus:bg-input-bg"
                    value={section.title}
                    onChange={(event) => updateSection(section.id, { title: event.target.value })}
                  />
                  <span
                    className={`hidden rounded-full px-2.5 py-1 text-xs font-black sm:inline-flex ${completeCount > 0 ? 'text-white' : 'bg-badge-neutral text-badge-neutral-text'}`}
                    style={completeCount > 0 ? { background: 'var(--color-accent)' } : undefined}
                  >
                    {completeCount} / {sectionItems.length}
                  </span>
                  <IconButton label="Remove section" onClick={() => {
                    setSections((current) => current.filter((candidate) => candidate.id !== section.id));
                    setItems((current) => current.filter((item) => item.sectionId !== section.id));
                    markDirty();
                  }}><Trash2 size={15} /></IconButton>
                </div>

                {!isCollapsed && (
                  <div className="space-y-1.5 p-2.5">
                    {sectionItems.map((item) => {
                      const showItemBefore = draggedItem?.sectionId === section.id && itemDropTarget?.sectionId === section.id && itemDropTarget.id === item.id && itemDropTarget.position === 'before';
                      const showItemAfter = draggedItem?.sectionId === section.id && itemDropTarget?.sectionId === section.id && itemDropTarget.id === item.id && itemDropTarget.position === 'after';
                      const isDraggedItem = draggedItem?.id === item.id;

                      return (
                      <Fragment key={item.id}>
                      {showItemBefore && (
                        <DropPlaceholder
                          kind="item"
                          onDragOver={(event) => onItemDragOver(event, section.id, item.id, 'before')}
                          onDrop={(event) => onItemDrop(event, section.id, item.id, 'before')}
                        />
                      )}
                      <div
                        className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-1.5 rounded-md border border-app-border-subtle bg-card-alt px-2 py-1.5 transition ${isDraggedItem ? 'opacity-0' : item.isComplete ? 'opacity-75' : ''}`}
                        aria-hidden={isDraggedItem ? 'true' : undefined}
                        draggable
                        onDragStart={() => setDraggedItem({ id: item.id, sectionId: section.id })}
                        onDragOver={(event) => onItemDragOver(event, section.id, item.id)}
                        onDrop={(event) => onItemDrop(event, section.id, item.id)}
                        onDragEnd={clearDragState}
                      >
                        <span className="flex h-7 items-center">
                          <GripVertical size={16} className="cursor-grab text-muted-light" aria-hidden="true" />
                        </span>
                        <div className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-1.5">
                          <span className="flex h-7 items-center">
                            <input
                              className="h-4 w-4 accent-accent"
                              type="checkbox"
                              checked={item.isComplete}
                              onChange={(event) => updateItem(item.id, { isComplete: event.target.checked })}
                              aria-label="Complete line item"
                            />
                          </span>
                          <AutoSizeLineItemTextarea
                            isComplete={item.isComplete}
                            value={item.itemText}
                            onChange={(itemText) => updateItem(item.id, { itemText })}
                          />
                        </div>
                        <div className="flex gap-1">
                          <IconButton compact label="Remove item" onClick={() => {
                            setItems((current) => current.filter((candidate) => candidate.id !== item.id));
                            markDirty();
                          }}><Trash2 size={15} /></IconButton>
                        </div>
                      </div>
                      {showItemAfter && (
                        <DropPlaceholder
                          kind="item"
                          onDragOver={(event) => onItemDragOver(event, section.id, item.id, 'after')}
                          onDrop={(event) => onItemDrop(event, section.id, item.id, 'after')}
                        />
                      )}
                      </Fragment>
                      );
                    })}

                    <form
                      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-1.5 rounded-md border border-dashed border-input-border bg-card-alt p-1.5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        addItem(section.id);
                      }}
                    >
                      <button className="grid h-8 w-8 place-items-center rounded-md bg-accent text-white disabled:opacity-50" type="submit" disabled={!newItemTextBySection[section.id]?.trim()}>
                        <Plus size={16} aria-hidden="true" />
                      </button>
                      <input
                        className="min-h-8 min-w-0 rounded-md border border-input-border bg-input-bg px-2 text-sm font-semibold text-ink"
                        placeholder="Add line item"
                        value={newItemTextBySection[section.id] || ''}
                        onChange={(event) => setNewItemTextBySection((current) => ({ ...current, [section.id]: event.target.value }))}
                      />
                    </form>
                  </div>
                )}
              </section>
              {showSectionAfter && (
                <DropPlaceholder
                  kind="section"
                  onDragOver={(event) => onSectionDragOver(event, section.id, 'after')}
                  onDrop={(event) => onSectionDrop(event, section.id, 'after')}
                />
              )}
              </Fragment>
            );
          })}

          <form
            className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 rounded-md border border-dashed border-input-border bg-card p-3 shadow-soft"
            onSubmit={(event) => {
              event.preventDefault();
              addSection();
            }}
          >
            <button className="grid h-11 w-11 place-items-center rounded-md bg-accent text-white disabled:opacity-50" type="submit" disabled={!newSectionTitle.trim()}>
              <Plus size={20} aria-hidden="true" />
            </button>
            <input
              className="min-h-11 min-w-0 rounded-md border border-input-border bg-input-bg px-3 text-sm font-bold text-ink"
              placeholder="Add section"
              value={newSectionTitle}
              onChange={(event) => setNewSectionTitle(event.target.value)}
            />
          </form>
        </div>
      </div>

      <div className="sticky bottom-20 z-10 lg:hidden">
        <button
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-black text-white shadow-soft disabled:opacity-50"
          type="button"
          disabled={!canSave}
          onClick={saveChanges}
          title="Save Changes (Command-S / Ctrl-S)"
          aria-keyshortcuts="Meta+S Control+S"
        >
          <Save size={16} aria-hidden="true" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </section>
  );
}

function DropPlaceholder({ kind, onDragOver, onDrop }: { kind: 'section' | 'item'; onDragOver: (event: DragEvent<HTMLDivElement>) => void; onDrop: (event: DragEvent<HTMLDivElement>) => void }) {
  return (
    <div
      className={`${kind === 'section' ? 'min-h-20 shadow-soft' : 'min-h-14'} grid place-items-center rounded-md border-2 border-dashed text-xs font-black uppercase tracking-[0.16em]`}
      style={{
        borderColor: 'rgba(218, 119, 86, 0.95)',
        background: 'rgba(218, 119, 86, 0.18)',
        boxShadow: 'inset 0 0 0 1px rgba(218, 119, 86, 0.28), 0 0 0 1px rgba(218, 119, 86, 0.18)',
        color: 'rgba(255, 190, 166, 0.95)',
      }}
      aria-hidden="true"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {kind === 'section' ? 'Drop section here' : 'Drop item here'}
    </div>
  );
}

function AutoSizeLineItemTextarea({ isComplete, value, onChange }: { isComplete: boolean; value: string; onChange: (value: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.max(32, textarea.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      aria-label="Scope line item"
      className={`min-h-8 min-w-0 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold leading-5 focus:border-input-border focus:bg-input-bg ${isComplete ? 'text-muted line-through' : 'text-ink'}`}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function IconButton({ label, disabled, compact, onClick, children }: { label: string; disabled?: boolean; compact?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`${compact ? 'h-8 w-8' : 'h-9 w-9'} grid place-items-center rounded-md border border-input-border bg-card text-muted-strong transition hover:bg-card-alt disabled:opacity-35`}
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function mergeSectionOrder(existing: DraftSection[], orderedActive: DraftSection[]) {
  const orderById = new Map(orderedActive.map((section, index) => [section.id, (index + 1) * 10]));
  return existing.map((section) => orderById.has(section.id) ? { ...section, sortOrder: orderById.get(section.id) || section.sortOrder } : section);
}

function mergeItemOrder(existing: DraftItem[], orderedActive: DraftItem[], sectionId: string) {
  const orderById = new Map(orderedActive.map((item, index) => [item.id, (index + 1) * 10]));
  return existing.map((item) => item.sectionId === sectionId && orderById.has(item.id) ? { ...item, sortOrder: orderById.get(item.id) || item.sortOrder } : item);
}
