import { useEffect, useMemo, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import type { JobCode, JobSite, ScopeBuilderItem, ScopeBuilderProject, ScopeBuilderSection } from '../domain/types';
import type { AdminTimeClockService } from '../services/TimeClockService';

interface AdminScopeBuilderProps {
  service: AdminTimeClockService;
  jobSites: JobSite[];
  jobCodes: JobCode[];
}

type DraftSection = ScopeBuilderSection;
type DraftItem = ScopeBuilderItem;

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  function moveSection(sectionId: string, direction: -1 | 1) {
    const current = orderedSections;
    const index = current.findIndex((section) => section.id === sectionId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return;
    const next = [...current];
    const [section] = next.splice(index, 1);
    next.splice(targetIndex, 0, section);
    setSections((existing) => mergeSectionOrder(existing, next));
    markDirty();
  }

  function moveItem(itemId: string, sectionId: string, direction: -1 | 1) {
    const current = sectionItemSort(items.filter((item) => item.sectionId === sectionId && item.isActive));
    const index = current.findIndex((item) => item.id === itemId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return;
    const next = [...current];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    setItems((existing) => mergeItemOrder(existing, next, sectionId));
    markDirty();
  }

  function onSectionDrop(targetSectionId: string) {
    if (!draggedSectionId || draggedSectionId === targetSectionId) return;
    const current = orderedSections;
    const fromIndex = current.findIndex((section) => section.id === draggedSectionId);
    const toIndex = current.findIndex((section) => section.id === targetSectionId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...current];
    const [section] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, section);
    setSections((existing) => mergeSectionOrder(existing, next));
    setDraggedSectionId(null);
    markDirty();
  }

  function onItemDrop(sectionId: string, targetItemId: string) {
    if (!draggedItem || draggedItem.sectionId !== sectionId || draggedItem.id === targetItemId) return;
    const current = sectionItemSort(items.filter((item) => item.sectionId === sectionId && item.isActive));
    const fromIndex = current.findIndex((item) => item.id === draggedItem.id);
    const toIndex = current.findIndex((item) => item.id === targetItemId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...current];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    setItems((existing) => mergeItemOrder(existing, next, sectionId));
    setDraggedItem(null);
    markDirty();
  }

  async function saveChanges() {
    if (!canSave) return;
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
      setIsSaving(false);
    }
  }

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
        >
          <Save size={16} aria-hidden="true" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {error && <div className="rounded-md border border-error-border bg-error-bg p-3 text-sm font-bold text-error-text">{error}</div>}
      {message && <div className="rounded-md border border-success-border bg-success-bg p-3 text-sm font-bold text-success">{message}</div>}

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
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

          {orderedSections.map((section, sectionIndex) => {
            const isCollapsed = collapsedSectionIds.has(section.id);
            const sectionItems = sectionItemSort(items.filter((item) => item.sectionId === section.id && item.isActive));
            const completeCount = sectionItems.filter((item) => item.isComplete).length;

            return (
              <section
                className="rounded-md border border-app-border bg-card shadow-soft"
                key={section.id}
                draggable
                onDragStart={() => setDraggedSectionId(section.id)}
                onDragOver={(event: DragEvent) => event.preventDefault()}
                onDrop={() => onSectionDrop(section.id)}
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
                  <span className="hidden rounded-full bg-badge-neutral px-2.5 py-1 text-xs font-black text-badge-neutral-text sm:inline-flex">
                    {completeCount} / {sectionItems.length}
                  </span>
                  <div className="hidden gap-1 sm:flex">
                    <IconButton label="Move section up" disabled={sectionIndex === 0} onClick={() => moveSection(section.id, -1)}><ArrowUp size={15} /></IconButton>
                    <IconButton label="Move section down" disabled={sectionIndex === orderedSections.length - 1} onClick={() => moveSection(section.id, 1)}><ArrowDown size={15} /></IconButton>
                  </div>
                  <IconButton label="Remove section" onClick={() => {
                    setSections((current) => current.filter((candidate) => candidate.id !== section.id));
                    setItems((current) => current.filter((item) => item.sectionId !== section.id));
                    markDirty();
                  }}><Trash2 size={15} /></IconButton>
                </div>

                {!isCollapsed && (
                  <div className="space-y-2 p-3">
                    {sectionItems.map((item, itemIndex) => (
                      <div
                        className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-app-border-subtle bg-card-alt p-2"
                        key={item.id}
                        draggable
                        onDragStart={() => setDraggedItem({ id: item.id, sectionId: section.id })}
                        onDragOver={(event: DragEvent) => event.preventDefault()}
                        onDrop={() => onItemDrop(section.id, item.id)}
                      >
                        <GripVertical size={17} className="cursor-grab text-muted-light" aria-hidden="true" />
                        <div className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2">
                          <input
                            className="h-5 w-5 accent-accent"
                            type="checkbox"
                            checked={item.isComplete}
                            onChange={(event) => updateItem(item.id, { isComplete: event.target.checked })}
                            aria-label="Complete line item"
                          />
                          <textarea
                            className="min-h-10 min-w-0 resize-y rounded-md border border-transparent bg-transparent px-2 py-2 text-sm font-semibold leading-5 text-ink focus:border-input-border focus:bg-input-bg"
                            value={item.itemText}
                            onChange={(event) => updateItem(item.id, { itemText: event.target.value })}
                          />
                        </div>
                        <div className="flex gap-1">
                          <IconButton label="Move item up" disabled={itemIndex === 0} onClick={() => moveItem(item.id, section.id, -1)}><ArrowUp size={15} /></IconButton>
                          <IconButton label="Move item down" disabled={itemIndex === sectionItems.length - 1} onClick={() => moveItem(item.id, section.id, 1)}><ArrowDown size={15} /></IconButton>
                          <IconButton label="Remove item" onClick={() => {
                            setItems((current) => current.filter((candidate) => candidate.id !== item.id));
                            markDirty();
                          }}><Trash2 size={15} /></IconButton>
                        </div>
                      </div>
                    ))}

                    <form
                      className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2 rounded-md border border-dashed border-input-border bg-card-alt p-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        addItem(section.id);
                      }}
                    >
                      <button className="grid h-10 w-10 place-items-center rounded-md bg-accent text-white disabled:opacity-50" type="submit" disabled={!newItemTextBySection[section.id]?.trim()}>
                        <Plus size={18} aria-hidden="true" />
                      </button>
                      <input
                        className="min-h-10 min-w-0 rounded-md border border-input-border bg-input-bg px-3 text-sm font-semibold text-ink"
                        placeholder="Add line item"
                        value={newItemTextBySection[section.id] || ''}
                        onChange={(event) => setNewItemTextBySection((current) => ({ ...current, [section.id]: event.target.value }))}
                      />
                    </form>
                  </div>
                )}
              </section>
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
        >
          <Save size={16} aria-hidden="true" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </section>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className="grid h-9 w-9 place-items-center rounded-md border border-input-border bg-card text-muted-strong transition hover:bg-card-alt disabled:opacity-35"
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
