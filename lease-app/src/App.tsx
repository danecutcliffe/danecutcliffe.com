import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { LeaseAppAdapters } from './adapters';
import type {
  Building,
  ConfigurationState,
  Entity,
  LeaseDataset,
  LeaseDraft,
  ManageSection,
  SessionUser,
  StandardOption,
  Unit,
} from './domain';
import {
  draftForSelectedUnit,
  effectiveDepositAmount,
  generateUnitDisplayName,
  initialLeaseDraft,
  recalculateEndDate,
  selectUnitForBuilding,
  unitsForBuilding,
  validateLeaseDraft,
} from './lib/leaseForm';
import './styles.css';

type AppProps = { adapters: LeaseAppAdapters };
type View = 'new' | 'manage';

export default function App({ adapters }: AppProps) {
  const [session, setSession] = useState<SessionUser | null | undefined>(undefined);
  const [dataset, setDataset] = useState<LeaseDataset | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('new');
  const [manageTarget, setManageTarget] = useState<{ section: ManageSection; recordId?: string }>();

  useEffect(() => {
    let active = true;
    adapters.auth.getSession().then((value) => active && setSession(value)).catch((reason) => {
      if (active) {
        setError(messageOf(reason));
        setSession(null);
      }
    });
    const unsubscribe = adapters.auth.subscribe((value) => setSession(value));
    return () => { active = false; unsubscribe(); };
  }, [adapters]);

  const reloadDataset = async () => {
    const value = await adapters.data.loadDataset();
    setDataset(value);
    return value;
  };

  useEffect(() => {
    if (!session) {
      setDataset(null);
      return;
    }
    reloadDataset().catch((reason) => setError(messageOf(reason)));
  }, [session]);

  const openManage = (target?: { section: ManageSection; recordId?: string }) => {
    setManageTarget(target ?? { section: 'entities' });
    setView('manage');
  };

  if (session === undefined) return <CenteredStatus>Opening Lease Generator…</CenteredStatus>;
  if (!session) return <Login adapters={adapters} initialError={error} />;
  if (!session.isAdmin || !session.isActive) {
    return <CenteredStatus>This account does not have active administrator access.</CenteredStatus>;
  }
  if (!dataset) return <CenteredStatus>{error || 'Loading portfolio…'}</CenteredStatus>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Private tool</p>
          <h1>Lease Generator</h1>
        </div>
        <nav aria-label="Primary">
          <button className={view === 'new' ? 'nav-active' : ''} onClick={() => setView('new')}>New Lease</button>
          <button className={view === 'manage' ? 'nav-active' : ''} onClick={() => openManage()}>Manage</button>
        </nav>
        <div className="account">
          <span>{session.displayName || session.email}</span>
          <button className="text-button" onClick={() => adapters.auth.signOut()}>Sign out</button>
        </div>
      </header>
      <main>
        {error && <Notice kind="error" onDismiss={() => setError('')}>{error}</Notice>}
        {view === 'new' ? (
          <NewLease
            adapters={adapters}
            dataset={dataset}
            onDatasetChange={reloadDataset}
            onManage={openManage}
          />
        ) : (
          <Manage
            adapters={adapters}
            dataset={dataset}
            initialTarget={manageTarget}
            onDatasetChange={reloadDataset}
          />
        )}
      </main>
    </div>
  );
}

function Login({ adapters, initialError }: { adapters: LeaseAppAdapters; initialError?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError ?? '');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await adapters.auth.signIn(email, password); }
    catch (reason) { setError(messageOf(reason)); setBusy(false); }
  };
  return (
    <div className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <p className="eyebrow">Private tool</p>
        <h1>Lease Generator</h1>
        <p className="muted">Sign in with your existing administrator account.</p>
        {error && <Notice kind="error">{error}</Notice>}
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

function NewLease({ adapters, dataset, onDatasetChange, onManage }: {
  adapters: LeaseAppAdapters;
  dataset: LeaseDataset;
  onDatasetChange: () => Promise<LeaseDataset>;
  onManage: (target?: { section: ManageSection; recordId?: string }) => void;
}) {
  const [draft, setDraft] = useState(() => initialLeaseDraft(dataset));
  const [endOverridden, setEndOverridden] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [extraInclusion, setExtraInclusion] = useState('');
  const [extraResponsibility, setExtraResponsibility] = useState('');
  const units = useMemo(() => unitsForBuilding(dataset, draft.buildingId), [dataset, draft.buildingId]);
  const selectedUnit = dataset.units.find((unit) => unit.id === draft.unitId);
  const selectedBuilding = dataset.buildings.find((b) => b.id === draft.buildingId);
  const selectedEntity = selectedBuilding ? dataset.entities.find((entity) => entity.id === selectedBuilding.entityId) : undefined;
  const issues = validateLeaseDraft(dataset, draft);
  const includedOptions = dataset.standardOptions.filter((option) => option.active && option.category.startsWith('included_'));
  const responsibilityOptions = dataset.standardOptions.filter((option) => option.active && option.category === 'tenant_responsibility');

  const setBuilding = (buildingId: string) => {
    const unitId = selectUnitForBuilding(dataset, buildingId);
    const unit = dataset.units.find((record) => record.id === unitId);
    setDraft((current) => unit ? draftForSelectedUnit({ ...current, buildingId }, unit) : { ...initialLeaseDraft(dataset), buildingId });
    setTermsOpen(Boolean(unit && (unit.inclusionConfigurationState === 'unknown' || unit.responsibilityConfigurationState === 'unknown')));
  };
  const setUnit = (unitId: string) => {
    const unit = dataset.units.find((record) => record.id === unitId);
    if (unit) setDraft((current) => draftForSelectedUnit(current, unit));
    setTermsOpen(Boolean(unit && (unit.inclusionConfigurationState === 'unknown' || unit.responsibilityConfigurationState === 'unknown')));
  };
  const updateDateInputs = (patch: Partial<Pick<LeaseDraft, 'startDate' | 'fixedTermMonths'>>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (next.termType === 'fixed' && !endOverridden) next.endDate = recalculateEndDate(next.startDate, next.fixedTermMonths);
      return next;
    });
  };
  const toggleOption = (option: StandardOption, checked: boolean) => {
    setDraft((current) => {
      const key = option.category === 'tenant_responsibility' ? 'tenantResponsibilityOptionIds' : 'includedOptionIds';
      let ids = checked ? [...new Set([...current[key], option.id])] : current[key].filter((id) => id !== option.id);
      if (checked && ['washer_dryer_free', 'washer_dryer_coin'].includes(option.systemKey ?? '')) {
        const counterpart = option.systemKey === 'washer_dryer_free' ? 'washer_dryer_coin' : 'washer_dryer_free';
        ids = ids.filter((id) => dataset.standardOptions.find((candidate) => candidate.id === id)?.systemKey !== counterpart);
      }
      const stateKey = option.category === 'tenant_responsibility' ? 'responsibilityConfigurationState' : 'inclusionConfigurationState';
      return { ...current, [key]: ids, [stateKey]: ids.length ? 'known_populated' : 'known_empty' };
    });
  };
  const addTenant = () => setDraft((current) => ({ ...current, tenants: [...current.tenants, ''] }));
  const changeTenant = (index: number, value: string) => setDraft((current) => ({ ...current, tenants: current.tenants.map((tenant, currentIndex) => currentIndex === index ? value : tenant) }));
  const removeTenant = (index: number) => setDraft((current) => ({ ...current, tenants: current.tenants.filter((_, currentIndex) => currentIndex !== index) }));

  const addLeaseOnlyText = (kind: 'included' | 'responsibility') => {
    const raw = kind === 'included' ? extraInclusion : extraResponsibility;
    const value = raw.trim().replace(/\s{2,}/gu, ' ');
    if (!value) return;
    setDraft((current) => kind === 'included'
      ? { ...current, additionalIncludedTexts: [...current.additionalIncludedTexts, value], inclusionConfigurationState: 'known_populated' }
      : { ...current, additionalResponsibilityTexts: [...current.additionalResponsibilityTexts, value], responsibilityConfigurationState: 'known_populated' });
    if (kind === 'included') setExtraInclusion(''); else setExtraResponsibility('');
  };
  const addStandardOption = async (kind: 'included' | 'responsibility') => {
    const raw = kind === 'included' ? extraInclusion : extraResponsibility;
    const value = raw.trim().replace(/\s{2,}/gu, ' ');
    if (!value) return;
    const option: StandardOption = {
      id: `option-${crypto.randomUUID()}`,
      category: kind === 'included' ? 'included_other' : 'tenant_responsibility',
      label: value,
      pdfText: value,
      active: true,
    };
    try {
      await adapters.data.saveStandardOption(option);
      await onDatasetChange();
      setDraft((current) => kind === 'included'
        ? { ...current, includedOptionIds: [...current.includedOptionIds, option.id], inclusionConfigurationState: 'known_populated' }
        : { ...current, tenantResponsibilityOptionIds: [...current.tenantResponsibilityOptionIds, option.id], responsibilityConfigurationState: 'known_populated' });
      if (kind === 'included') setExtraInclusion(''); else setExtraResponsibility('');
    } catch (reason) { setMessage(messageOf(reason)); }
  };
  const saveUnitDefaults = async () => {
    if (!selectedUnit) return;
    setBusy(true); setMessage('');
    try {
      await adapters.data.saveUnit({
        ...selectedUnit,
        includedOptionIds: draft.includedOptionIds,
        tenantResponsibilityOptionIds: draft.tenantResponsibilityOptionIds,
        inclusionConfigurationState: draft.inclusionConfigurationState,
        responsibilityConfigurationState: draft.responsibilityConfigurationState,
      });
      await onDatasetChange();
      setMessage('Saved these terms as the Unit defaults.');
    } catch (reason) { setMessage(messageOf(reason)); }
    finally { setBusy(false); }
  };
  const saveRentDefault = async () => {
    if (!selectedUnit || draft.rentalRate === null) return;
    setBusy(true); setMessage('');
    try {
      await adapters.data.saveUnit({ ...selectedUnit, defaultRentalRate: draft.rentalRate });
      await onDatasetChange();
      setMessage('Saved the current rental rate as the Unit default.');
    } catch (reason) { setMessage(messageOf(reason)); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    setBusy(true); setMessage('');
    try {
      const generated = await adapters.pdf.generate(draft, dataset);
      download(generated.blob, generated.filename);
      setMessage('Lease generated. The downloaded PDF remains editable.');
    } catch (reason) { setMessage(messageOf(reason)); }
    finally { setBusy(false); }
  };

  const termsUnknown = draft.inclusionConfigurationState === 'unknown' || draft.responsibilityConfigurationState === 'unknown';
  const termsChanged = selectedUnit ? (
    !sameIds(draft.includedOptionIds, selectedUnit.includedOptionIds) ||
    !sameIds(draft.tenantResponsibilityOptionIds, selectedUnit.tenantResponsibilityOptionIds) ||
    draft.inclusionConfigurationState !== selectedUnit.inclusionConfigurationState ||
    draft.responsibilityConfigurationState !== selectedUnit.responsibilityConfigurationState
  ) : false;
  const hasLeaseOnlyTerms = draft.additionalIncludedTexts.length > 0 || draft.additionalResponsibilityTexts.length > 0;

  return (
    <section className="workspace new-lease">
      <div className="section-heading"><p className="eyebrow">Prepare</p><h2>New Lease</h2><p>Choose the Unit, enter the tenants and dates, then generate the editable Form 1.</p></div>
      {message && <Notice kind={message.toLowerCase().includes('saved') || message.toLowerCase().includes('generated') ? 'success' : 'error'} onDismiss={() => setMessage('')}>{message}</Notice>}
      <div className="form-grid two">
        <label>Building
          <select id="building" value={draft.buildingId} onChange={(event) => setBuilding(event.target.value)}>
            <option value="">Select building…</option>
            {[...dataset.buildings].sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true })).map((building) => <option key={building.id} value={building.id}>{building.displayName}</option>)}
          </select>
        </label>
        <label>Unit
          <select id="unit" value={draft.unitId} disabled={!draft.buildingId} onChange={(event) => setUnit(event.target.value)}>
            <option value="">{draft.buildingId ? 'Select unit…' : 'Choose a building first'}</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.displayName}</option>)}
          </select>
        </label>
      </div>
      {selectedEntity && <p className="resolved">Leasing entity: <strong>{selectedEntity.legalName}</strong></p>}

      <fieldset className="plain-fieldset"><legend>Tenant(s)</legend>
        <div className="stack compact">
          {draft.tenants.map((tenant, index) => (
            <div className="inline-input" key={index}>
              <label className="sr-only" htmlFor={`tenant-${index}`}>Tenant {index + 1}</label>
              <input id={`tenant-${index}`} value={tenant} placeholder={index === 0 ? 'Full legal name / tenant text' : `Additional tenant ${index + 1}`} onChange={(event) => changeTenant(index, event.target.value)} />
              {index > 0 && <button className="icon-button" aria-label={`Remove tenant ${index + 1}`} onClick={() => removeTenant(index)}>Remove</button>}
            </div>
          ))}
          <button className="text-button left" onClick={addTenant}>+ Add another tenant</button>
        </div>
      </fieldset>

      <fieldset className="plain-fieldset"><legend>Lease Term</legend>
        <div className="choice-row">
          <label><input type="radio" name="term" checked={draft.termType === 'start_only'} onChange={() => setDraft((current) => ({ ...current, termType: 'start_only', endDate: '' }))} />Term (Start Only)</label>
          <label><input type="radio" name="term" checked={draft.termType === 'fixed'} onChange={() => { setEndOverridden(false); setDraft((current) => ({ ...current, termType: 'fixed', endDate: recalculateEndDate(current.startDate, current.fixedTermMonths) })); }} />Fixed Term</label>
        </div>
        <div className={`form-grid ${draft.termType === 'fixed' ? 'three' : 'one'}`}>
          <label>Start Date<input id="start-date" type="date" value={draft.startDate} onChange={(event) => updateDateInputs({ startDate: event.target.value })} /></label>
          {draft.termType === 'fixed' && <>
            <label>Term<span className="input-suffix"><input id="term-months" type="number" min="1" max="1200" value={draft.fixedTermMonths} onChange={(event) => updateDateInputs({ fixedTermMonths: Number(event.target.value) })} /><span>months</span></span></label>
            <label>End Date<input id="end-date" type="date" value={draft.endDate} onChange={(event) => { setEndOverridden(true); setDraft((current) => ({ ...current, endDate: event.target.value })); }} />
              {endOverridden && <button className="text-button field-action" onClick={() => { setEndOverridden(false); setDraft((current) => ({ ...current, endDate: recalculateEndDate(current.startDate, current.fixedTermMonths) })); }}>Use calculated date</button>}
            </label>
          </>}
        </div>
      </fieldset>

      <div className="form-grid two">
        <label>Rental Rate<span className="money-input"><span>$</span><input id="rental-rate" inputMode="decimal" value={draft.rentalRate ?? ''} onChange={(event) => setDraft((current) => ({ ...current, rentalRate: event.target.value === '' ? null : Number(event.target.value) }))} /></span>
          {selectedUnit && draft.rentalRate !== selectedUnit.defaultRentalRate && <button className="text-button field-action" disabled={busy} onClick={saveRentDefault}>Save as Unit default</button>}
        </label>
        <fieldset className="nested-fieldset"><legend>Damage Deposit</legend>
          <div className="choice-row"><label><input type="radio" name="deposit" checked={draft.depositMode === 'one_month_rent'} onChange={() => setDraft((current) => ({ ...current, depositMode: 'one_month_rent' }))} />One Month’s Rent</label><label><input type="radio" name="deposit" checked={draft.depositMode === 'other'} onChange={() => setDraft((current) => ({ ...current, depositMode: 'other', otherDepositAmount: current.otherDepositAmount ?? current.rentalRate }))} />Other</label></div>
          {draft.depositMode === 'other' ? <span className="money-input"><span>$</span><input id="deposit-other" inputMode="decimal" value={draft.otherDepositAmount ?? ''} onChange={(event) => setDraft((current) => ({ ...current, otherDepositAmount: event.target.value === '' ? null : Number(event.target.value) }))} /></span> : <p className="linked-value">${formatMoney(effectiveDepositAmount(draft))} · follows current rental rate</p>}
        </fieldset>
      </div>

      <section id="lease-terms" className={`terms-panel ${termsUnknown ? 'needs-attention' : ''}`}>
        <div className="terms-summary">
          <div><p className="eyebrow">Rent Inclusions &amp; Responsibilities</p><h3>{termsUnknown ? 'Not yet configured for this unit' : 'Using saved terms for this unit'}</h3><p>{termsSummary(dataset, draft)}</p></div>
          <button className="secondary" onClick={() => setTermsOpen((open) => !open)}>{termsOpen ? 'Close details' : 'Review / change'}</button>
        </div>
        {termsOpen && <div className="terms-details">
          <TermOptions title="Included in rent" options={includedOptions} selectedIds={draft.includedOptionIds} onToggle={toggleOption} />
          <div className="add-option"><label>Additional inclusion<input list="included-options" value={extraInclusion} onChange={(event) => setExtraInclusion(event.target.value)} /></label><datalist id="included-options">{includedOptions.map((option) => <option key={option.id} value={option.label} />)}</datalist><div><button className="secondary" onClick={() => addLeaseOnlyText('included')}>Use for this lease only</button><button className="text-button" onClick={() => addStandardOption('included')}>Add as a standard option</button></div></div>
          {draft.additionalIncludedTexts.map((value, index) => <RemovableText key={`${value}-${index}`} value={value} onRemove={() => setDraft((current) => ({ ...current, additionalIncludedTexts: current.additionalIncludedTexts.filter((_, i) => i !== index) }))} />)}
          <button className="text-button left" onClick={() => setDraft((current) => ({ ...current, includedOptionIds: [], additionalIncludedTexts: [], inclusionConfigurationState: 'known_empty' }))}>Confirm no rent inclusions</button>
          <TermOptions title="Tenant responsibilities" options={responsibilityOptions} selectedIds={draft.tenantResponsibilityOptionIds} onToggle={toggleOption} />
          <div className="add-option"><label>Add responsibility<input list="responsibility-options" value={extraResponsibility} onChange={(event) => setExtraResponsibility(event.target.value)} /></label><datalist id="responsibility-options">{responsibilityOptions.map((option) => <option key={option.id} value={option.label} />)}</datalist><div><button className="secondary" onClick={() => addLeaseOnlyText('responsibility')}>Use for this lease only</button><button className="text-button" onClick={() => addStandardOption('responsibility')}>Add as a standard option</button></div></div>
          {draft.additionalResponsibilityTexts.map((value, index) => <RemovableText key={`${value}-${index}`} value={value} onRemove={() => setDraft((current) => ({ ...current, additionalResponsibilityTexts: current.additionalResponsibilityTexts.filter((_, i) => i !== index) }))} />)}
          <button className="text-button left" onClick={() => setDraft((current) => ({ ...current, tenantResponsibilityOptionIds: [], additionalResponsibilityTexts: [], responsibilityConfigurationState: 'known_empty' }))}>Confirm no tenant responsibilities</button>
          {termsChanged && <div className="save-defaults"><span>{hasLeaseOnlyTerms ? 'Add lease-only wording as a standard option before saving it as a Unit default.' : 'Changes apply to this lease only.'}</span><button className="secondary" disabled={busy || hasLeaseOnlyTerms} onClick={saveUnitDefaults}>Save as Unit defaults</button></div>}
        </div>}
      </section>

      {issues.length > 0 && <div className="validation-summary" role="alert"><h3>Complete {issues.length} item{issues.length === 1 ? '' : 's'} before generating</h3><ul>{issues.map((issue) => <li key={issue.id}><button onClick={() => issue.manageTarget ? onManage(issue.manageTarget) : document.getElementById(issue.fieldId)?.focus()}>{issue.message}</button></li>)}</ul></div>}
      <div className="generate-row"><button className="primary generate" disabled={busy || issues.length > 0} onClick={generate}>{busy ? 'Working…' : 'Generate Lease'}</button><span>Creates a fresh, editable fillable PDF on this device.</span></div>
    </section>
  );
}

function TermOptions({ title, options, selectedIds, onToggle }: { title: string; options: StandardOption[]; selectedIds: string[]; onToggle: (option: StandardOption, checked: boolean) => void }) {
  const available = options.filter((option) => !selectedIds.includes(option.id));
  const selected = selectedIds.map((id) => options.find((option) => option.id === id)).filter((option): option is StandardOption => Boolean(option));
  const addOption = (id: string) => { const option = options.find((o) => o.id === id); if (option) onToggle(option, true); };
  return <fieldset className="option-list"><legend>{title}</legend>
    {selected.length > 0 && <div className="selected-options">{selected.map((option) => <div className="selected-text" key={option.id}><span>{option.label}</span><button className="text-button" onClick={() => onToggle(option, false)}>Remove</button></div>)}</div>}
    {available.length > 0 && <label>Add from standard options<select value="" onChange={(event) => { if (event.target.value) addOption(event.target.value); }}><option value="">Select an option to add…</option>{available.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
    {options.length === 0 && selected.length === 0 && <p className="muted">No standard options available. Create them in Manage → Standard Options.</p>}
  </fieldset>;
}

function RemovableText({ value, onRemove }: { value: string; onRemove: () => void }) {
  return <div className="selected-text"><span>{value}</span><button className="text-button" onClick={onRemove}>Remove</button></div>;
}

function Manage({ adapters, dataset, initialTarget, onDatasetChange }: {
  adapters: LeaseAppAdapters;
  dataset: LeaseDataset;
  initialTarget?: { section: ManageSection; recordId?: string };
  onDatasetChange: () => Promise<LeaseDataset>;
}) {
  const [section, setSection] = useState<ManageSection>(initialTarget?.section ?? 'entities');
  const [recordId, setRecordId] = useState(initialTarget?.recordId ?? '');
  const [message, setMessage] = useState('');
  useEffect(() => { if (initialTarget) { setSection(initialTarget.section); setRecordId(initialTarget.recordId ?? ''); } }, [initialTarget]);
  const saved = async (operation: Promise<unknown>) => {
    setMessage('');
    try { await operation; await onDatasetChange(); setMessage('Saved.'); }
    catch (reason) { setMessage(messageOf(reason)); }
  };
  const archiveEntity = (record: Entity) => saved(adapters.data.saveEntity({ ...record, active: false } as any));
  const archiveBuilding = (record: Building) => saved(adapters.data.saveBuilding({ ...record, active: false } as any));
  const archiveUnit = (record: Unit) => { saved(adapters.data.saveUnit({ ...record, active: false } as any)); setRecordId(''); };
  const deleteRecord = (collection: 'entities'|'buildings'|'units'|'standardOptions', record: { id: string; recordRevision?: number }) => {
    if (!confirm(`Permanently delete this record? This cannot be undone.`)) return;
    const op = adapters.data.deleteRecord(collection, record.id, record.recordRevision ?? 0);
    saved(op); setRecordId('');
  };
  return <section className="workspace manage"><div className="section-heading"><p className="eyebrow">Portfolio</p><h2>Manage</h2><p>Canonical lease defaults and safe portfolio data operations.</p></div>{message && <Notice kind={message === 'Saved.' ? 'success' : 'error'} onDismiss={() => setMessage('')}>{message}</Notice>}<div className="manage-layout"><nav className="manage-nav" aria-label="Manage sections">{(['entities','buildings','units','options','data'] as ManageSection[]).map((value) => <button key={value} className={section === value ? 'nav-active' : ''} onClick={() => { setSection(value); setRecordId(''); }}>{manageLabel(value)}</button>)}</nav><div className="manage-content">
    {section === 'entities' && <EntityEditor records={dataset.entities} selectedId={recordId} onSelect={setRecordId} onSave={(record) => saved(adapters.data.saveEntity(record))} onArchive={archiveEntity} onDelete={(record) => deleteRecord('entities', record)} />}
    {section === 'buildings' && <BuildingEditor records={dataset.buildings} entities={dataset.entities} selectedId={recordId} onSelect={setRecordId} onSave={(record) => saved(adapters.data.saveBuilding(record))} onArchive={archiveBuilding} onDelete={(record) => deleteRecord('buildings', record)} />}
    {section === 'units' && <UnitEditor records={dataset.units} buildings={dataset.buildings} entities={dataset.entities} options={dataset.standardOptions} selectedId={recordId} onSelect={setRecordId} onSave={(record) => saved(adapters.data.saveUnit(record))} onArchive={archiveUnit} onDelete={(record) => deleteRecord('units', record)} />}
    {section === 'options' && <OptionEditor records={dataset.standardOptions} selectedId={recordId} onSelect={setRecordId} onSave={(record) => saved(adapters.data.saveStandardOption(record))} />}
    {section === 'data' && <DataTools adapters={adapters} dataset={dataset} onDatasetChange={onDatasetChange} />}
  </div></div></section>;
}

function RecordPicker<T extends { id: string }>({ records, selectedId, onSelect, label, title }: { records: T[]; selectedId: string; onSelect: (id: string) => void; label: (record: T) => string; title?: string }) {
  const sorted = [...records].sort((a, b) => label(a).localeCompare(label(b), undefined, { numeric: true }));
  return <label>{title}<select value={selectedId} onChange={(event) => onSelect(event.target.value)}><option value="">Select…</option>{sorted.map((record) => <option key={record.id} value={record.id}>{label(record)}</option>)}</select></label>;
}

function EntityEditor({ records, selectedId, onSelect, onSave, onArchive, onDelete }: { records: Entity[]; selectedId: string; onSelect: (id: string) => void; onSave: (value: Entity) => void; onArchive: (value: Entity) => void; onDelete: (value: Entity) => void }) {
  const source = records.find((record) => record.id === selectedId);
  const [value, setValue] = useState<Entity | undefined>(source);
  useEffect(() => setValue(source), [source]);
  const fields: Array<[keyof Entity, string]> = [['legalName','Legal name'],['addressForService','Address for service'],['community','Community'],['province','Province'],['postalCode','Postal code'],['phone','Phone'],['rentPaymentRecipient','Rent-payment recipient'],['rentPaymentInstructions','Rent-payment instructions'],['rentPaymentAddress','Rent-payment address']];
  const newEntity = () => { const entity: Entity = { id: `entity-${crypto.randomUUID()}`, legalName:'', addressForService:'', community:'Charlottetown', province:'PE', postalCode:'', phone:'', rentPaymentRecipient:'', rentPaymentInstructions:'', rentPaymentAddress:'', recordRevision: 0 }; setValue(entity); onSelect(''); };
  return <Editor title="Entities"><div className="picker-row"><RecordPicker title="Select entity" records={records} selectedId={selectedId} onSelect={onSelect} label={(record) => record.legalName} /><button className="secondary" onClick={newEntity}>+ New entity</button></div>{value && <form onSubmit={(event) => { event.preventDefault(); onSave(value); }}><div className="form-grid two">{fields.map(([key,label]) => <label key={String(key)}>{label}<input value={String(value[key] ?? '')} onChange={(event) => setValue({ ...value, [key]: event.target.value })} /></label>)}</div><div className="editor-actions"><button className="primary">{value.recordRevision === 0 ? 'Create Entity' : 'Save Entity'}</button>{(value.recordRevision ?? 0) > 0 && <button type="button" className="text-button danger" onClick={() => onArchive(value)}>Archive</button>}{(value.recordRevision ?? 0) > 0 && <button type="button" className="text-button danger" onClick={() => onDelete(value)}>Delete</button>}</div></form>}</Editor>;
}

function BuildingEditor({ records, entities, selectedId, onSelect, onSave, onArchive, onDelete }: { records: Building[]; entities: Entity[]; selectedId: string; onSelect: (id: string) => void; onSave: (value: Building) => void; onArchive: (value: Building) => void; onDelete: (value: Building) => void }) {
  const source = records.find((record) => record.id === selectedId); const [value,setValue] = useState<Building | undefined>(source); useEffect(() => setValue(source),[source]);
  const fields: Array<[keyof Building,string]> = [['displayName','Display name'],['streetAddress','Street address'],['community','Community'],['province','Province'],['postalCode','Postal code']];
  const newBuilding = () => { const building: Building = { id: `building-${crypto.randomUUID()}`, entityId:'', displayName:'', streetAddress:'', community:'Charlottetown', province:'PE', postalCode:'', recordRevision: 0 }; setValue(building); onSelect(''); };
  return <Editor title="Buildings"><div className="picker-row"><RecordPicker title="Select building" records={records} selectedId={selectedId} onSelect={onSelect} label={(record) => record.displayName} /><button className="secondary" onClick={newBuilding}>+ New building</button></div>{value && <form onSubmit={(event) => { event.preventDefault(); onSave(value); }}><div className="form-grid two">
    <label>Owning entity<select value={value.entityId} onChange={(event) => setValue({...value,entityId:event.target.value})}><option value="">Select…</option>{entities.map((record) => <option key={record.id} value={record.id}>{record.legalName}</option>)}</select></label>
    {fields.map(([key,label]) => <label key={String(key)}>{label}<input value={String(value[key] ?? '')} onChange={(event) => setValue({ ...value, [key]: event.target.value })} /></label>)}</div><div className="editor-actions"><button className="primary">{value.recordRevision === 0 ? 'Create Building' : 'Save Building'}</button>{(value.recordRevision ?? 0) > 0 && <button type="button" className="text-button danger" onClick={() => onArchive(value)}>Archive</button>}{(value.recordRevision ?? 0) > 0 && <button type="button" className="text-button danger" onClick={() => onDelete(value)}>Delete</button>}</div></form>}</Editor>;
}

function UnitEditor({ records, buildings, entities, options, selectedId, onSelect, onSave, onArchive, onDelete }: { records: Unit[]; buildings: Building[]; entities: Entity[]; options: StandardOption[]; selectedId: string; onSelect: (id: string) => void; onSave: (value: Unit) => void; onArchive: (value: Unit) => void; onDelete: (value: Unit) => void }) {
  const [filterBuildingId, setFilterBuildingId] = useState('');
  const filteredRecords = filterBuildingId ? records.filter((r) => r.buildingId === filterBuildingId) : records;
  const source = records.find((record) => record.id === selectedId); const [value,setValue] = useState<Unit | undefined>(source); useEffect(() => setValue(source),[source]);
  const toggle = (key: 'includedOptionIds'|'tenantResponsibilityOptionIds', id: string, checked: boolean) => {
    if (!value) return;
    const ids = checked ? [...new Set([...value[key],id])] : value[key].filter((item) => item !== id);
    const stateKey = key === 'includedOptionIds' ? 'inclusionConfigurationState' : 'responsibilityConfigurationState';
    setValue({ ...value, [key]: ids, [stateKey]: ids.length > 0 ? 'known_populated' as const : 'known_empty' as const });
  };
  const computedDisplayName = value ? generateUnitDisplayName(value.unitNumber, value.premisesStreetAddress) : '';
  const duplicate = value?.unitNumber.trim() ? records.find((r) => r.id !== value.id && r.buildingId === value.buildingId && r.unitNumber.trim().toLowerCase() === value.unitNumber.trim().toLowerCase()) : undefined;
  const selectedBuilding = value ? buildings.find((b) => b.id === value.buildingId) : undefined;
  const derivedEntity = selectedBuilding ? entities.find((e) => e.id === selectedBuilding.entityId) : undefined;
  const handleSave = (event: FormEvent) => { event.preventDefault(); if (value && !duplicate) onSave({ ...value, displayName: computedDisplayName || value.displayName, entityId: derivedEntity?.id ?? value.entityId }); };
  const isNew = (value?.recordRevision ?? 0) === 0;
  const newUnit = () => {
    const bId = filterBuildingId || buildings[0]?.id || '';
    const unit: Unit = { id: `unit-${crypto.randomUUID()}`, buildingId: bId, entityId: '', displayName:'', unitNumber:'', premisesStreetAddress:'', premisesCommunity:'', premisesPostalCode:'', premisesType:'apartment', defaultRentalRate: 0, rentPeriod:'Month', rentDueDay:'1st', includedOptionIds:[], tenantResponsibilityOptionIds:[], inclusionConfigurationState:'unknown', responsibilityConfigurationState:'unknown', recordRevision: 0 };
    setValue(unit); onSelect('');
  };
  return <Editor title="Units">
    <label>Filter by building<select value={filterBuildingId} onChange={(event) => { setFilterBuildingId(event.target.value); onSelect(''); }}><option value="">All buildings</option>{[...buildings].sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true })).map((b) => <option key={b.id} value={b.id}>{b.displayName}</option>)}</select></label>
    <div className="picker-row"><RecordPicker title="Select unit" records={filteredRecords} selectedId={selectedId} onSelect={onSelect} label={(record) => filterBuildingId ? record.displayName : `${buildings.find((building) => building.id === record.buildingId)?.displayName ?? ''} · ${record.displayName}`} /><button className="secondary" onClick={newUnit}>+ New unit</button></div>{value && <form onSubmit={handleSave}>
    {computedDisplayName && <p className="resolved">Display name: <strong>{computedDisplayName}</strong></p>}
    {derivedEntity && <p className="resolved">Leasing entity: <strong>{derivedEntity.legalName}</strong></p>}
    {selectedBuilding && !derivedEntity && <p className="notice error">Building "{selectedBuilding.displayName}" has no entity assigned. Set one in Manage → Buildings.</p>}
    {duplicate && <p className="notice error">Unit number "{value.unitNumber}" already exists in this building ({selectedBuilding?.displayName}).</p>}
    <div className="form-grid two">
    <label>Building<select value={value.buildingId} onChange={(event) => setValue({...value,buildingId:event.target.value})}><option value="">Select…</option>{[...buildings].sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true })).map((record) => <option key={record.id} value={record.id}>{record.displayName}</option>)}</select></label>
    {([['premisesStreetAddress','Premises street address'],['unitNumber','Unit number (numeric or letter)'],['rentPeriod','Rent period'],['rentDueDay','Rent due day']] as Array<[keyof Unit,string]>).map(([key,label]) => <label key={String(key)}>{label}<input value={String(value[key] ?? '')} onChange={(event) => setValue({...value,[key]:event.target.value})} /></label>)}
    <label>Premises type<select value={value.premisesType} onChange={(event) => setValue({...value,premisesType:event.target.value})}><option value="">Select…</option><option value="apartment">Apartment</option><option value="single_family_home">Single Family Home</option><option value="room">Room</option><option value="mobile_home">Mobile Home</option><option value="duplex_or_row_housing">Portion of Duplex or Row Housing</option><option value="mobile_home_site">Mobile Home Site</option></select></label>
    <label>Default rental rate<span className="money-input"><span>$</span><input inputMode="decimal" value={value.defaultRentalRate ?? ''} onChange={(event) => setValue({...value,defaultRentalRate:event.target.value === '' ? null : Number(event.target.value)})} /></span></label>
    <StateSelect label="Inclusions state" value={value.inclusionConfigurationState} onChange={(state) => setValue({...value,inclusionConfigurationState:state})} />
    <StateSelect label="Responsibilities state" value={value.responsibilityConfigurationState} onChange={(state) => setValue({...value,responsibilityConfigurationState:state})} />
  </div><TermOptions title="Included in rent" options={options.filter((option) => option.active && option.category.startsWith('included_'))} selectedIds={value.includedOptionIds} onToggle={(option,checked) => toggle('includedOptionIds',option.id,checked)} /><TermOptions title="Tenant responsibilities" options={options.filter((option) => option.active && option.category === 'tenant_responsibility')} selectedIds={value.tenantResponsibilityOptionIds} onToggle={(option,checked) => toggle('tenantResponsibilityOptionIds',option.id,checked)} /><div className="editor-actions"><button className="primary" disabled={!!duplicate}>{isNew ? 'Create Unit' : 'Save Unit'}</button>{!isNew && <button type="button" className="text-button danger" onClick={() => onArchive(value)}>Archive</button>}{!isNew && <button type="button" className="text-button danger" onClick={() => onDelete(value)}>Delete</button>}</div></form>}</Editor>;
}

function StateSelect({ label, value, onChange }: { label: string; value: ConfigurationState; onChange: (value: ConfigurationState) => void }) { return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value as ConfigurationState)}><option value="unknown">Unknown / not configured</option><option value="known_empty">Known empty</option><option value="known_populated">Known populated</option></select></label>; }

function OptionEditor({ records, selectedId, onSelect, onSave }: { records: StandardOption[]; selectedId: string; onSelect: (id: string) => void; onSave: (value: StandardOption) => void }) {
  const source = records.find((record) => record.id === selectedId); const [value,setValue] = useState<StandardOption | undefined>(source); useEffect(() => setValue(source),[source]);
  const newOption = () => { const option: StandardOption = { id: `option-${crypto.randomUUID()}`, category:'included_other',label:'',pdfText:'',active:true }; setValue(option); onSelect(''); };
  return <Editor title="Standard Options"><div className="picker-row"><RecordPicker title="Select option" records={records} selectedId={selectedId} onSelect={onSelect} label={(record) => record.label} /><button className="secondary" onClick={newOption}>+ New option</button></div>{value && <form onSubmit={(event) => { event.preventDefault(); onSave(value); }}><div className="form-grid two"><label>Label<input required value={value.label} onChange={(event) => setValue({...value,label:event.target.value})} /></label><label>Category<select value={value.category} onChange={(event) => setValue({...value,category:event.target.value as StandardOption['category']})}><option value="included_standard">Included standard</option><option value="included_other">Included other</option><option value="tenant_responsibility">Tenant responsibility</option></select></label><label className="span-two">PDF text<input required value={value.pdfText} onChange={(event) => setValue({...value,pdfText:event.target.value})} /></label><label className="checkbox"><input type="checkbox" checked={value.active} onChange={(event) => setValue({...value,active:event.target.checked})} />Active</label></div><button className="primary">Save Option</button></form>}</Editor>;
}

function Editor({ title, children }: { title: string; children: React.ReactNode }) { return <section className="editor"><h3>{title}</h3>{children}</section>; }

function DataTools({ adapters, dataset, onDatasetChange }: { adapters: LeaseAppAdapters; dataset: LeaseDataset; onDatasetChange: () => Promise<LeaseDataset> }) {
  const [file,setFile] = useState<File>(); const [preview,setPreview] = useState<Awaited<ReturnType<typeof adapters.data.previewPortfolioImport>>>(); const [backups,setBackups] = useState<Awaited<ReturnType<typeof adapters.data.listBackups>>>([]); const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false);
  const refreshBackups = () => adapters.data.listBackups().then(setBackups).catch((reason) => setMessage(messageOf(reason)));
  useEffect(() => { refreshBackups(); }, []);
  const exportData = async () => { try { const result = await adapters.data.exportDataset(); download(new Blob([result.json],{type:'application/json'}),result.filename); } catch(reason) { setMessage(messageOf(reason)); } };
  const previewImport = async () => { if (!file) return; setBusy(true); setMessage(''); try { setPreview(await adapters.data.previewPortfolioImport(file)); } catch(reason) { setMessage(messageOf(reason)); } finally { setBusy(false); } };
  const commit = async () => { if (!preview) return; setBusy(true); setMessage(''); try { const result = await adapters.data.commitPortfolioImport(preview); await onDatasetChange(); await refreshBackups(); setPreview(undefined); setMessage(`Import complete. Revision ${result.revision}; backup ${result.backupId}.`); } catch(reason) { setMessage(messageOf(reason)); } finally { setBusy(false); } };
  const backup = async () => { setBusy(true); try { await adapters.data.createBackup('Manual backup'); await refreshBackups(); setMessage('Backup created.'); } catch(reason) { setMessage(messageOf(reason)); } finally { setBusy(false); } };
  const restore = async (id:string) => { setBusy(true); try { await adapters.data.restoreBackup(id,dataset.revision); await onDatasetChange(); await refreshBackups(); setMessage('Backup restored. A pre-restore backup was created automatically.'); } catch(reason) { setMessage(messageOf(reason)); } finally { setBusy(false); } };
  return <Editor title="Portfolio Data"><p className="muted">Current dataset revision: {dataset.revision}. Imports never delete records merely because they are absent.</p>{message && <Notice kind={message.includes('complete') || message.includes('created') || message.includes('restored') ? 'success' : 'error'}>{message}</Notice>}<div className="data-actions"><button className="secondary" onClick={exportData}>Export Data</button><button className="secondary" disabled={busy} onClick={backup}>Create backup</button></div><section className="subsection"><h4>Import Portfolio Data</h4><input type="file" accept="application/json,.json" onChange={(event) => { setFile(event.target.files?.[0]); setPreview(undefined); }} /><button className="primary" disabled={!file || busy} onClick={previewImport}>Preview import</button>{preview && <div className="import-preview"><h4>Import preview</h4><CountsTable counts={preview.counts} /><p>{preview.conflicts.length} conflicts · {preview.invalidReferences.length} invalid references · {preview.validationErrors.length} validation errors</p>{[...preview.validationErrors,...preview.invalidReferences].length > 0 && <ul>{[...preview.validationErrors,...preview.invalidReferences].map((value,index) => <li key={index}>{value}</li>)}</ul>}{preview.conflicts.length > 0 && <div className="conflict-list"><h5>Conflicts</h5>{preview.conflicts.map((conflict,index) => <label key={`${conflict.recordType}-${conflict.recordId}-${conflict.field}`}><input type="checkbox" checked={conflict.acceptIncoming} onChange={(event) => setPreview({...preview,conflicts:preview.conflicts.map((item,itemIndex) => itemIndex === index ? {...item,acceptIncoming:event.target.checked} : item)})} /><span><strong>{conflict.recordId} · {conflict.field}</strong><small>Current: {displayValue(conflict.current)} · Incoming: {displayValue(conflict.incoming)}</small><small>{eventualResolution(conflict.acceptIncoming)}</small></span></label>)}</div>}<button className="primary" disabled={busy || preview.validationErrors.length > 0 || preview.invalidReferences.length > 0} onClick={commit}>Commit import</button></div>}</section><section className="subsection"><h4>Backups</h4>{backups.length ? <div className="backup-list">{backups.map((item) => <div key={item.id}><span><strong>{item.label || item.reason}</strong><small>{new Date(item.createdAt).toLocaleString()} · revision {item.sourceRevision}</small></span><button className="secondary" disabled={busy} onClick={() => restore(item.id)}>Restore</button></div>)}</div> : <p className="muted">No backups yet.</p>}</section></Editor>;
}

function CountsTable({ counts }: { counts: import('./domain').ImportCounts }) { return <table><thead><tr><th>Records</th><th>Added</th><th>Updated</th><th>Unchanged</th></tr></thead><tbody>{Object.entries(counts).map(([name,value]) => <tr key={name}><th>{name}</th><td>{value.added}</td><td>{value.updated}</td><td>{value.unchanged}</td></tr>)}</tbody></table>; }

function CenteredStatus({ children }: { children: React.ReactNode }) { return <div className="centered-status">{children}</div>; }
function Notice({ children, kind, onDismiss }: { children: React.ReactNode; kind: 'error'|'success'; onDismiss?: () => void }) { return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><span>{children}</span>{onDismiss && <button className="icon-button" onClick={onDismiss} aria-label="Dismiss">×</button>}</div>; }
function manageLabel(value: ManageSection) { return ({entities:'Entities',buildings:'Buildings',units:'Units',options:'Standard Options',data:'Import & Backup'})[value]; }
function messageOf(reason: unknown) { return reason instanceof Error ? reason.message : String(reason); }
function formatMoney(value: number | null) { return value === null || !Number.isFinite(value) ? '—' : value.toLocaleString('en-CA',{minimumFractionDigits:0,maximumFractionDigits:2}); }
function sameIds(left:string[],right:string[]) { return left.length === right.length && [...left].sort().every((value,index) => value === [...right].sort()[index]); }
function termsSummary(dataset:LeaseDataset,draft:LeaseDraft) { if (draft.inclusionConfigurationState === 'unknown' || draft.responsibilityConfigurationState === 'unknown') return 'Review the detailed controls to establish the effective terms for this lease.'; const included = draft.includedOptionIds.map((id) => dataset.standardOptions.find((option) => option.id === id)?.label).filter(Boolean); const responsibilities = draft.tenantResponsibilityOptionIds.map((id) => dataset.standardOptions.find((option) => option.id === id)?.label).filter(Boolean); return `Included: ${[...included,...draft.additionalIncludedTexts].join(' · ') || 'None'}  Tenant: ${[...responsibilities,...draft.additionalResponsibilityTexts].join(' · ') || 'None'}`; }
function download(blob:Blob,filename:string) { const url=URL.createObjectURL(blob); const anchor=document.createElement('a'); anchor.href=url; anchor.download=filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
function displayValue(value:unknown) { if (value === null || value === undefined || value === '') return 'blank'; if (typeof value === 'string') return value; return JSON.stringify(value); }
function eventualResolution(acceptIncoming:boolean) { return acceptIncoming ? 'Incoming value will replace the current value.' : 'Current value will be kept.'; }
