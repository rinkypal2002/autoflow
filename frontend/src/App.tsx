import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import DashboardPage from './pages/DashboardPage';
import AgentsPage from './pages/agents/AgentsPage';
import VulnerabilityAgentPage from './pages/agents/VulnerabilityAgentPage';
import VulnerabilityDashboardPage from './pages/agents/VulnerabilityDashboardPage';
import VoiceTranscriptionAgentPage from './pages/agents/voice_transcription_agent';
import WorkspaceDirectoryPage from './pages/WorkspaceDirectoryPage';
import BuilderHubPage from './pages/BuilderHubPage';
import WorkspaceEditorPage from './pages/WorkspaceEditorPage';
import EnginePage from './pages/EnginePage';
import CataloguePage from './pages/CataloguePage';

function App() {
  return (
    <DndProvider backend={HTML5Backend}>
      <Router>
        <Routes>
          <Route path="/" element={<DashboardPage />} />

          {/* Automation */}
          <Route path="/catalogue" element={<CataloguePage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/vulnerability-scanner" element={<VulnerabilityAgentPage />} />
          <Route path="/agents/vulnerability-scanner/dashboard" element={<VulnerabilityDashboardPage />} />
          <Route path="/agents/voice-transcription" element={<VoiceTranscriptionAgentPage />} />

          {/* System */}
          {/* <Route path="/system/engine-monitor" element={<EnginePage />} />
          <Route path="/system/engine-monitor/*" element={<EnginePage />} /> */}

          <Route path="/system/engine-monitor" element={<EnginePage />} />
<Route path="/system/engine-monitor/*" element={<EnginePage />} />

          {/* Workspace */}
          <Route path="/workspace" element={<WorkspaceDirectoryPage />} />
          <Route path="/workspace/editor" element={<BuilderHubPage />} />
          <Route path="/workspace/editor/:id" element={<WorkspaceEditorPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </DndProvider>
  );
}

export default App;


