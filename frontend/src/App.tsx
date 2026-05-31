import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import api from './utils/api';
import Dashboard from './pages/Dashboard';
import FieldMapping from './pages/FieldMapping';
import SyncLog from './pages/SyncLog';
import FormIntegration from './pages/FormIntegration';
import Layout from './components/Layout';
import LoadingScreen from './components/LoadingScreen';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initSession();
  }, []);

  async function initSession() {
    try {
      // In Wix dashboard widget context, the instance token comes via Wix SDK
      // For demo/dev, we simulate with fixed values
      const instanceId = new URLSearchParams(window.location.search).get('instanceId')
        || 'demo-instance-123';
      const siteId = new URLSearchParams(window.location.search).get('siteId')
        || 'demo-site-456';

      const { data } = await api.post('/auth/session', { instanceId, siteId });
      sessionStorage.setItem('session_token', data.token);
      sessionStorage.setItem('instance_id', instanceId);
      setReady(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initialize session');
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="card p-8 max-w-md text-center">
          <p className="text-red-600 font-medium">Session Error</p>
          <p className="text-zinc-600 text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mapping" element={<FieldMapping />} />
          <Route path="/sync-log" element={<SyncLog />} />
          <Route path="/forms" element={<FormIntegration />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
