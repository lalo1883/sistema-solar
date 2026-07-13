"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query, type DocumentData, type QueryDocumentSnapshot, type Timestamp } from "firebase/firestore";
import { createProjectRecord, createTaskRecord, db, initializeAnalytics, updateProjectSteps, updateTaskDescription, updateTaskStatus, uploadProjectDocument } from "@/lib/firebase";

type NextStep = {
  id: string;
  text: string;
  done: boolean;
};

type Project = {
  id: string;
  name: string;
  area: string;
  owner: string;
  progress: number;
  risk: string;
  status: string;
  insight?: string;
  description?: string;
  session2Alignment?: string;
  priority?: string;
  nextSteps: NextStep[];
  updatedAt?: Timestamp;
};

type ProjectDocument = {
  id: string;
  name: string;
  project: string;
  contentType?: string;
  status: string;
  createdAt?: Timestamp;
};

type Finding = {
  id: string;
  title: string;
  summary: string;
  priority: string;
  project?: string;
};

type Task = {
  id: string;
  title: string;
  description: string;
  projectId: string;
  projectName: string;
  assignee: string;
  status: string;
  priority: string;
  dueDate?: string;
};

function toProject(doc: QueryDocumentSnapshot<DocumentData>): Project {
  const data = doc.data();
  return {
    id: doc.id,
    name: String(data.name ?? "Proyecto sin nombre"),
    area: String(data.area ?? "Sin área"),
    owner: String(data.owner ?? "Sin responsable"),
    progress: Number(data.progress ?? 0),
    risk: String(data.risk ?? "Sin evaluar"),
    status: String(data.status ?? "potential"),
    insight: data.insight ? String(data.insight) : undefined,
    description: data.description ? String(data.description) : undefined,
    session2Alignment: data.session2Alignment ? String(data.session2Alignment) : undefined,
    priority: data.priority ? String(data.priority) : undefined,
    nextSteps: Array.isArray(data.nextSteps)
      ? data.nextSteps.map((step: { id?: string; text?: string; done?: boolean }, index: number) => ({
          id: step.id ?? String(index),
          text: String(step.text ?? ""),
          done: Boolean(step.done),
        }))
      : [],
    updatedAt: data.updatedAt,
  };
}

function toTask(doc: QueryDocumentSnapshot<DocumentData>): Task {
  const data = doc.data();
  return { id: doc.id, title: String(data.title ?? "Tarea sin título"), description: String(data.description ?? ""), projectId: String(data.projectId ?? ""), projectName: String(data.projectName ?? "Sin proyecto"), assignee: String(data.assignee ?? "Sin asignar"), status: String(data.status ?? "backlog"), priority: String(data.priority ?? "medium"), dueDate: data.dueDate ? String(data.dueDate) : undefined };
}

function toDocument(doc: QueryDocumentSnapshot<DocumentData>): ProjectDocument {
  const data = doc.data();
  return {
    id: doc.id,
    name: String(data.name ?? "Documento sin nombre"),
    project: String(data.project ?? "Sin proyecto"),
    contentType: data.contentType ? String(data.contentType) : undefined,
    status: String(data.status ?? "uploaded"),
    createdAt: data.createdAt,
  };
}

function toFinding(doc: QueryDocumentSnapshot<DocumentData>): Finding {
  const data = doc.data();
  return {
    id: doc.id,
    title: String(data.title ?? "Hallazgo sin título"),
    summary: String(data.summary ?? ""),
    priority: String(data.priority ?? "Sin prioridad"),
    project: data.project ? String(data.project) : undefined,
  };
}

function formatDate(value?: Timestamp) {
  if (!value?.toDate) return "Pendiente";
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value.toDate());
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
}

export default function Home() {
  const [active, setActive] = useState("Resumen");
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Project | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDescription, setTaskDescription] = useState("");
  const [newStepText, setNewStepText] = useState("");
  const [savingSteps, setSavingSteps] = useState(false);
  const [todayLabel, setTodayLabel] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [uploadProject, setUploadProject] = useState("Sin proyecto");
  const [uploading, setUploading] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", area: "", owner: "Eduardo", status: "potential" });
  const [newTask, setNewTask] = useState({ title: "", description: "", projectId: "", assignee: "Eduardo", status: "todo", priority: "medium", dueDate: "" });
  const [toast, setToast] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => projects.filter((project) => `${project.name} ${project.area} ${project.owner}`.toLowerCase().includes(search.toLowerCase())), [projects, search]);
  const completedProjects = projects.filter((project) => project.progress >= 100).length;
  const readiness = projects.length ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length) : null;

  useEffect(() => {
    setTodayLabel(new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Chihuahua" }).format(new Date()).toUpperCase());
    initializeAnalytics().catch(() => undefined);
    let ready = 0;
    const markReady = () => { ready += 1; if (ready === 4) setLoading(false); };
    const unsubProjects = onSnapshot(query(collection(db, "projects"), orderBy("createdAt", "desc")), (snapshot) => { setProjects(snapshot.docs.map(toProject)); markReady(); }, () => markReady());
    const unsubDocuments = onSnapshot(query(collection(db, "documents"), orderBy("createdAt", "desc")), (snapshot) => { setDocuments(snapshot.docs.map(toDocument)); markReady(); }, () => markReady());
    const unsubFindings = onSnapshot(collection(db, "findings"), (snapshot) => { setFindings(snapshot.docs.map(toFinding)); markReady(); }, () => markReady());
    const unsubTasks = onSnapshot(query(collection(db, "tasks"), orderBy("createdAt", "desc")), (snapshot) => { setTasks(snapshot.docs.map(toTask)); markReady(); }, () => markReady());
    return () => { unsubProjects(); unsubDocuments(); unsubFindings(); unsubTasks(); };
  }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      await Promise.all(Array.from(files).map((file) => uploadProjectDocument(file, uploadProject)));
      setUploadOpen(false);
      notify(`${files.length} documento(s) guardados en Firebase`);
    } catch (error) {
      console.error("Firebase upload failed", error);
      notify("No se pudo guardar. Revisa las reglas de Firebase.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleCreateProject(event: React.FormEvent) {
    event.preventDefault();
    if (!newProject.name.trim()) return;
    setSavingProject(true);
    try {
      await createProjectRecord(newProject);
      setProjectOpen(false);
      setNewProject({ name: "", area: "", owner: "Eduardo", status: "potential" });
      notify("Proyecto guardado en Firestore");
    } catch (error) {
      console.error("Firebase project creation failed", error);
      notify("No se pudo crear el proyecto. Revisa las reglas de Firebase.");
    } finally {
      setSavingProject(false);
    }
  }

  async function handleCreateTask(event: React.FormEvent) {
    event.preventDefault();
    const project = projects.find((item) => item.id === newTask.projectId);
    if (!newTask.title.trim() || !project) return;
    setSavingProject(true);
    try {
      await createTaskRecord({ ...newTask, projectName: project.name });
      setTaskOpen(false);
      setNewTask({ title: "", description: "", projectId: "", assignee: "Eduardo", status: "todo", priority: "medium", dueDate: "" });
      notify("Tarea guardada en Firestore");
    } catch (error) {
      console.error("Task creation failed", error);
      notify("No se pudo crear la tarea.");
    } finally { setSavingProject(false); }
  }

  async function persistSteps(project: Project, steps: NextStep[]) {
    setSavingSteps(true);
    try {
      await updateProjectSteps(project.id, steps);
      setSelected({ ...project, nextSteps: steps });
    } catch (error) {
      console.error("Project steps update failed", error);
      notify("No se pudo actualizar la ruta del proyecto.");
    } finally {
      setSavingSteps(false);
    }
  }

  function addStep() {
    if (!selected || !newStepText.trim()) return;
    const step: NextStep = { id: crypto.randomUUID(), text: newStepText.trim(), done: false };
    void persistSteps(selected, [...selected.nextSteps, step]);
    setNewStepText("");
  }

  function toggleStep(stepId: string) {
    if (!selected) return;
    const steps = selected.nextSteps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step));
    void persistSteps(selected, steps);
  }

  function removeStep(stepId: string) {
    if (!selected) return;
    const steps = selected.nextSteps.filter((step) => step.id !== stepId);
    void persistSteps(selected, steps);
  }

  async function saveTaskDescription() {
    if (!selectedTask) return;
    setSavingProject(true);
    try {
      await updateTaskDescription(selectedTask.id, taskDescription);
      setSelectedTask({ ...selectedTask, description: taskDescription.trim() });
      notify("Descripción actualizada");
    } catch (error) {
      console.error("Task description update failed", error);
      notify("No se pudo actualizar la descripción.");
    } finally { setSavingProject(false); }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><div><strong>Atlas</strong><small>Centro de inteligencia</small></div></div>
        <nav aria-label="Navegación principal">
          <p className="nav-label">ESPACIO DE TRABAJO</p>
          {["Resumen", "Proyectos", "Tareas", "Documentos", "Hallazgos"].map((item, index) => <button key={item} className={active === item ? "nav-item active" : "nav-item"} onClick={() => setActive(item)}><span className="nav-icon">{["⌂", "▦", "☷", "□", "✦"][index]}</span>{item}{item === "Hallazgos" && findings.length > 0 && <em>{findings.length}</em>}</button>)}
          <p className="nav-label second">PREPARACIÓN 2027</p>
          {["Plan de transición", "Escenarios", "Cumplimiento"].map((item, index) => <button key={item} className={active === item ? "nav-item active" : "nav-item"} onClick={() => setActive(item)}><span className="nav-icon">{["◴", "⌁", "✓"][index]}</span>{item}</button>)}
        </nav>
        <div className="sidebar-footer"><div className="profile"><div className="avatar">EN</div><div><strong>Eduardo Núñez</strong><small>Administrador</small></div></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="search-wrap"><span>⌕</span><input aria-label="Buscar" placeholder="Buscar proyectos..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></div>
          <button className="primary secondary-action" onClick={() => setTaskOpen(true)}>＋ Nueva tarea</button>
          <button className="primary secondary-action no-auto" onClick={() => setProjectOpen(true)}>＋ Nuevo proyecto</button>
          <button className="primary" onClick={() => setUploadOpen(true)}>＋ Agregar documento</button>
        </header>

        <div className="content">
          <div className="heading-row"><div><p className="eyebrow">{todayLabel || "HOY"}</p><h1>{active === "Resumen" ? "Preparación para la ley laboral 2027" : active}</h1><p>{loading ? "Conectando con Firebase..." : "Información sincronizada con Firestore."}</p></div>{active === "Tareas" && <button className="primary" onClick={() => setTaskOpen(true)}>＋ Nueva tarea</button>}</div>

          {active === "Tareas" ? <section className="kanban-wrap">
            <div className="board-toolbar"><div><strong>Tablero de trabajo</strong><span>{tasks.length} tarea(s) · Eduardo y Roberto</span></div><div className="people-stack"><i>E</i><i>R</i></div></div>
            <div className="kanban-board">{[
              ["backlog", "Pendientes"], ["todo", "Por hacer"], ["in_progress", "En progreso"], ["review", "En revisión"], ["done", "Terminado"]
            ].map(([status, label]) => <div className="kanban-column" key={status}><header><span className={`column-dot ${status}`} />{label}<em>{tasks.filter((task) => task.status === status).length}</em></header><div className="task-stack">{tasks.filter((task) => task.status === status).map((task) => <article className="task-card clickable" role="button" tabIndex={0} key={task.id} onClick={() => { setSelectedTask(task); setTaskDescription(task.description); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setSelectedTask(task); setTaskDescription(task.description); } }}><div className="task-meta"><span className={`priority ${task.priority}`}>{task.priority === "high" ? "Alta" : task.priority === "low" ? "Baja" : "Media"}</span><span>Ver detalle ›</span></div><h3>{task.title}</h3><p>{task.description || "Sin descripción práctica"}</p><small>{task.projectName}</small><footer><i>{task.assignee.charAt(0)}</i><span>{task.dueDate || "Sin fecha"}</span></footer><select aria-label={`Estado de ${task.title}`} value={task.status} onClick={(event) => event.stopPropagation()} onChange={(event) => { event.stopPropagation(); void updateTaskStatus(task.id, event.target.value); }}><option value="backlog">Pendientes</option><option value="todo">Por hacer</option><option value="in_progress">En progreso</option><option value="review">En revisión</option><option value="done">Terminado</option></select></article>)}{!loading && tasks.filter((task) => task.status === status).length === 0 && <button className="add-task-card" onClick={() => { setNewTask({ ...newTask, status }); setTaskOpen(true); }}>＋ Agregar tarea</button>}</div></div>)}</div>
          </section> : active === "Proyectos" ? <section className="portfolio-view">
            <div className="portfolio-head"><div><h2>Cartera de proyectos</h2><p>Separa oportunidades en evaluación del trabajo que ya está en marcha.</p></div><button className="primary" onClick={() => setProjectOpen(true)}>＋ Nuevo proyecto</button></div>
            <div className="portfolio-grid">{[["potential", "Proyectos potenciales"], ["active", "Proyectos activos"]].map(([status, label]) => <section className="portfolio-group panel" key={status}><header><div><span className={`portfolio-dot ${status}`} /><h3>{label}</h3></div><em>{projects.filter((project) => project.status === status).length}</em></header>{projects.filter((project) => project.status === status).map((project) => <button className="portfolio-card" key={project.id} onClick={() => setSelected(project)}><div className="portfolio-card-top"><i>{project.name.charAt(0)}</i><span className="status neutral">{project.risk}</span></div><h4>{project.name}</h4><p>{project.area}</p>{project.nextSteps.length > 0 && <div className="steps-progress"><i><em style={{ width: `${Math.round((project.nextSteps.filter((step) => step.done).length / project.nextSteps.length) * 100)}%` }} /></i><span>{project.nextSteps.filter((step) => step.done).length}/{project.nextSteps.length} pasos</span></div>}<footer><span><b>{initials(project.owner)}</b>{project.owner}</span><em>{tasks.filter((task) => task.projectId === project.id).length} tareas</em></footer></button>)}{!loading && projects.filter((project) => project.status === status).length === 0 && <div className="portfolio-empty">No hay proyectos en esta etapa.</div>}</section>)}</div>
          </section> : <>

          <section className={`readiness-card ${readiness === null ? "readiness-empty" : ""}`}>
            <div className="readiness-copy"><div className="tag">JORNADA LABORAL 2027</div>{readiness === null ? <><h2>Aún no hay datos para calcular la preparación</h2><p>Crea tu primer proyecto y agrega sus documentos. El indicador se construirá con información real.</p><button onClick={() => setProjectOpen(true)}>Crear primer proyecto <b>→</b></button></> : <><h2>Preparación actual: <span>{readiness}%</span></h2><p>Promedio calculado con el avance registrado en {projects.length} proyecto(s) y {documents.length} documento(s).</p><button onClick={() => setActive("Plan de transición")}>Ver plan de transición <b>→</b></button></>}</div>
            {readiness !== null && <div className="ring" style={{ "--percent": `${readiness}%` } as React.CSSProperties}><div><strong>{readiness}%</strong><small>Preparación</small></div></div>}
            <div className="milestone"><span>DATOS CONECTADOS</span><strong>Cloud Firestore</strong><small>Los cambios aparecen automáticamente</small></div>
          </section>

          <section className="metrics">
            <article><span className="metric-icon blue">▦</span><div><small>PROYECTOS ACTIVOS</small><strong>{projects.length}</strong><p>Registros en Firestore</p></div></article>
            <article><span className="metric-icon violet">□</span><div><small>DOCUMENTOS</small><strong>{documents.length}</strong><p>Archivos registrados</p></div></article>
            <article><span className="metric-icon amber">!</span><div><small>HALLAZGOS ABIERTOS</small><strong>{findings.length}</strong><p>Análisis registrados</p></div></article>
            <article><span className="metric-icon green">✓</span><div><small>PROYECTOS COMPLETADOS</small><strong>{completedProjects}</strong><p>Con 100% de avance</p></div></article>
          </section>

          <div className="grid-main">
            <section className="panel projects-panel">
              <div className="panel-head"><div><h2>Proyectos</h2><p>Datos en tiempo real desde Firestore.</p></div><button onClick={() => setProjectOpen(true)}>Nuevo proyecto ＋</button></div>
              <div className="table-head"><span>PROYECTO</span><span>RESPONSABLE</span><span>AVANCE</span><span>ESTADO</span><span /></div>
              {filtered.slice(0, 6).map((project) => <button className="project-row" key={project.id} onClick={() => setSelected(project)}><span className="project-title"><i>{project.name.charAt(0).toUpperCase()}</i><span><strong>{project.name}</strong><small>{project.area}</small></span></span><span className="owner"><i>{initials(project.owner)}</i><span>{project.owner}</span></span><span className="progress"><b>{project.progress}%</b><i><em style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }} /></i></span><span className="status neutral">{project.risk}</span><span className="chevron">›</span></button>)}
              {!loading && filtered.length === 0 && <div className="empty"><strong>{search ? "No hay coincidencias" : "Todavía no hay proyectos"}</strong><p>{search ? "Prueba con otro término." : "Crea el primero para comenzar a organizar la información real."}</p>{!search && <button className="primary" onClick={() => setProjectOpen(true)}>Crear proyecto</button>}</div>}
            </section>

            <aside className="panel insight-panel">
              <div className="spark">✦</div><span className="ai-label">HALLAZGOS</span>{findings.length ? <><h2>{findings[0].title}</h2><p>{findings[0].summary || "Sin resumen registrado."}</p><div className="mini-projects">{findings.slice(0, 3).map((finding) => <span key={finding.id}><i className="dot purple-dot" />{finding.project || "General"}<b>{finding.priority}</b></span>)}</div><button onClick={() => setActive("Hallazgos")}>Ver hallazgos <b>→</b></button></> : <><h2>Sin hallazgos registrados</h2><p>Cuando el análisis de documentos genere resultados, aparecerán aquí.</p><small>Fuente: colección “findings”</small></>}
            </aside>
          </div>

          <section className="panel documents-panel">
            <div className="panel-head"><div><h2>Documentos recientes</h2><p>Archivos reales registrados en Firebase.</p></div><button onClick={() => setUploadOpen(true)}>Agregar documento ＋</button></div>
            <div className="document-list">{documents.slice(0, 5).map((doc) => { const extension = doc.name.split(".").pop()?.toUpperCase() || "FILE"; return <div className="document" key={doc.id}><span className={`file-icon ${extension.toLowerCase()}`}>{extension.slice(0, 1)}</span><span><strong>{doc.name}</strong><small>{doc.project}</small></span><em>{formatDate(doc.createdAt)}</em><b className={doc.status === "analyzed" ? "done" : "processing"}>{doc.status === "analyzed" ? "✓ Analizado" : doc.status}</b><button aria-label={`Opciones para ${doc.name}`}>•••</button></div>; })}{!loading && documents.length === 0 && <div className="empty"><strong>Todavía no hay documentos</strong><p>Agrega el primero para comenzar a construir la base de conocimiento.</p><button className="primary" onClick={() => setUploadOpen(true)}>Agregar documento</button></div>}</div>
          </section>
          </>}
        </div>
      </section>

      {selected && <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><aside className="drawer"><button className="close" onClick={() => setSelected(null)}>×</button><span className="status neutral">{selected.status === "active" ? "Activo" : "Potencial"}</span><h2>{selected.name}</h2><p className="muted">{selected.area}</p>{selected.description && <><h3>Propuesta</h3><p className="drawer-description">{selected.description}</p></>}<h3>Visión actualizada en sesión 2</h3><div className="assistant-note"><span>✦</span><p>{selected.session2Alignment || "Pendiente de definir alineación estratégica."}</p></div>

          <h3>Ruta a seguir</h3>
          <p className="field-help">Los siguientes pasos concretos para avanzar este proyecto.</p>
          <div className="steps-list">
            {selected.nextSteps.map((step) => <div className={step.done ? "step-row done" : "step-row"} key={step.id}>
              <button type="button" className="step-check" aria-label={step.done ? "Marcar como pendiente" : "Marcar como hecho"} onClick={() => toggleStep(step.id)}>{step.done ? "✓" : ""}</button>
              <span>{step.text}</span>
              <button type="button" className="step-remove" aria-label="Eliminar paso" onClick={() => removeStep(step.id)}>×</button>
            </div>)}
            {selected.nextSteps.length === 0 && <div className="steps-empty">Todavía no hay pasos definidos.</div>}
          </div>
          <form className="step-add" onSubmit={(event) => { event.preventDefault(); addStep(); }}>
            <input placeholder="Agregar siguiente paso..." value={newStepText} onChange={(event) => setNewStepText(event.target.value)} disabled={savingSteps} />
            <button type="submit" className="primary" disabled={savingSteps || !newStepText.trim()}>＋</button>
          </form>

          <h3>Contexto del proyecto</h3><dl><div><dt>Responsable inicial</dt><dd>{selected.owner}</dd></div><div><dt>Prioridad</dt><dd>{selected.priority || "Sin definir"}</dd></div><div><dt>Avance</dt><dd>{selected.progress}%</dd></div><div><dt>Última actualización</dt><dd>{formatDate(selected.updatedAt)}</dd></div></dl></aside></div>}

      {selectedTask && <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTask(null)}><aside className="drawer task-detail"><button className="close" onClick={() => setSelectedTask(null)}>×</button><span className={`priority ${selectedTask.priority}`}>{selectedTask.priority === "high" ? "Prioridad alta" : selectedTask.priority === "low" ? "Prioridad baja" : "Prioridad media"}</span><h2>{selectedTask.title}</h2><p className="muted">{selectedTask.projectName}</p><h3>Descripción práctica</h3><p className="field-help">Explica con palabras sencillas qué hay que hacer, qué se debe entregar y cuándo se considera terminada.</p><textarea className="task-description-editor" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Ejemplo: Revisar el documento, resumir los requisitos en una página y compartirlos con Roberto para validación." /><button className="primary wide" disabled={savingProject} onClick={() => void saveTaskDescription()}>{savingProject ? "Guardando..." : "Guardar descripción"}</button><h3>Datos de la tarea</h3><dl><div><dt>Responsable</dt><dd>{selectedTask.assignee}</dd></div><div><dt>Estado</dt><dd>{selectedTask.status.replaceAll("_", " ")}</dd></div><div><dt>Fecha límite</dt><dd>{selectedTask.dueDate || "Sin fecha"}</dd></div></dl></aside></div>}

      {projectOpen && <div className="scrim modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && !savingProject && setProjectOpen(false)}><form className="upload-modal" onSubmit={handleCreateProject}><button type="button" className="close" disabled={savingProject} onClick={() => setProjectOpen(false)}>×</button><span className="modal-icon">▦</span><h2>Nuevo proyecto</h2><p>Agrégalo como potencial mientras se evalúa o como activo si ya está aprobado.</p><label>Nombre del proyecto<input required autoFocus value={newProject.name} onChange={(event) => setNewProject({ ...newProject, name: event.target.value })} /></label><label>Área<input value={newProject.area} onChange={(event) => setNewProject({ ...newProject, area: event.target.value })} /></label><label>Responsable<select value={newProject.owner} onChange={(event) => setNewProject({ ...newProject, owner: event.target.value })}><option>Eduardo</option><option>Roberto</option></select></label><label>Etapa<select value={newProject.status} onChange={(event) => setNewProject({ ...newProject, status: event.target.value })}><option value="potential">Potencial</option><option value="active">Activo</option></select></label><div className="modal-actions"><button type="button" disabled={savingProject} onClick={() => setProjectOpen(false)}>Cancelar</button><button className="primary" disabled={savingProject}>{savingProject ? "Guardando..." : "Crear proyecto"}</button></div></form></div>}

      {taskOpen && <div className="scrim modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && !savingProject && setTaskOpen(false)}><form className="upload-modal task-modal" onSubmit={handleCreateTask}><button type="button" className="close" disabled={savingProject} onClick={() => setTaskOpen(false)}>×</button><span className="modal-icon">☷</span><h2>Nueva tarea</h2><p>Cada tarea debe pertenecer a un proyecto y tener una persona responsable.</p><label>Título<input required autoFocus value={newTask.title} onChange={(event) => setNewTask({ ...newTask, title: event.target.value })} /></label><label>Descripción práctica<textarea value={newTask.description} onChange={(event) => setNewTask({ ...newTask, description: event.target.value })} placeholder="¿Qué hay que hacer y cuál es el resultado esperado?" /></label><label>Proyecto<select required value={newTask.projectId} onChange={(event) => setNewTask({ ...newTask, projectId: event.target.value })}><option value="">Selecciona un proyecto</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><div className="form-grid"><label>Responsable<select value={newTask.assignee} onChange={(event) => setNewTask({ ...newTask, assignee: event.target.value })}><option>Eduardo</option><option>Roberto</option></select></label><label>Prioridad<select value={newTask.priority} onChange={(event) => setNewTask({ ...newTask, priority: event.target.value })}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label><label>Estado<select value={newTask.status} onChange={(event) => setNewTask({ ...newTask, status: event.target.value })}><option value="backlog">Pendientes</option><option value="todo">Por hacer</option><option value="in_progress">En progreso</option><option value="review">En revisión</option><option value="done">Terminado</option></select></label><label>Fecha límite<input type="date" value={newTask.dueDate} onChange={(event) => setNewTask({ ...newTask, dueDate: event.target.value })} /></label></div><div className="modal-actions"><button type="button" disabled={savingProject} onClick={() => setTaskOpen(false)}>Cancelar</button><button className="primary" disabled={savingProject || projects.length === 0}>{savingProject ? "Guardando..." : "Crear tarea"}</button></div>{projects.length === 0 && <small className="form-hint">Primero crea un proyecto.</small>}</form></div>}

      {uploadOpen && <div className="scrim modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && !uploading && setUploadOpen(false)}><section className="upload-modal"><button className="close" disabled={uploading} onClick={() => setUploadOpen(false)}>×</button><span className="modal-icon">□</span><h2>Agregar documentos</h2><p>El archivo se guardará en Firebase Storage y sus datos en Cloud Firestore.</p><button className="dropzone" disabled={uploading} onClick={() => fileRef.current?.click()}><span>{uploading ? "◌" : "↑"}</span><strong>{uploading ? "Guardando en Firebase..." : "Selecciona archivos"}</strong><small>PDF, DOCX, XLSX, PPTX o TXT · Máx. 25 MB</small></button><input ref={fileRef} type="file" multiple hidden onChange={(event) => void handleFiles(event.target.files)} /><label>Asignar al proyecto<select disabled={uploading} value={uploadProject} onChange={(event) => setUploadProject(event.target.value)}><option>Sin proyecto</option>{projects.map((project) => <option key={project.id}>{project.name}</option>)}</select></label><div className="modal-actions"><button disabled={uploading} onClick={() => setUploadOpen(false)}>Cancelar</button><button disabled={uploading} className="primary" onClick={() => fileRef.current?.click()}>{uploading ? "Guardando..." : "Elegir archivos"}</button></div></section></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}
