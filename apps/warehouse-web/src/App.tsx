import { useState } from "react";
import LoginPage from "./pages/LoginPage";
import QueuePage from "./pages/QueuePage";
import TaskPage from "./pages/TaskPage";
import { PickingTask } from "./api";

type View = "login" | "queue" | "task";

export default function App() {
  const [view, setView] = useState<View>(
    localStorage.getItem("wh_token") ? "queue" : "login"
  );
  const [activeTask, setActiveTask] = useState<PickingTask | null>(null);

  if (view === "login") {
    return <LoginPage onLogin={() => setView("queue")} />;
  }

  if (view === "task" && activeTask) {
    return (
      <TaskPage
        task={activeTask}
        onBack={() => setView("queue")}
        onComplete={() => { setActiveTask(null); setView("queue"); }}
      />
    );
  }

  return (
    <QueuePage
      onSelectTask={(task) => { setActiveTask(task); setView("task"); }}
      onLogout={() => setView("login")}
    />
  );
}
