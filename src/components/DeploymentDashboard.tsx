import { useState } from 'react';
import { Zap, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { API } from '../api/client';

export default function DeploymentDashboard() {
  const [formData, setFormData] = useState({
    projectName: '',
    githubUser: 'lifegateportal',
    githubRepo: '',
    targetBranch: 'main'
  });
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [resultUrl, setResultUrl] = useState('');
  const [deploymentTriggered, setDeploymentTriggered] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const endpoint = `${API}/api/deploy`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to trigger edge deployment.');
      }

      setResultUrl(data.projectUrl);
      setDeploymentTriggered(data.deploymentTriggered === true);
      setStatus('success');
      
      // Reset form fields for the next deployment
      setFormData({ ...formData, projectName: '', githubRepo: '' });

    } catch (error: any) {
      console.error('[Deploy Error]', error);
      setErrorMessage(error.message);
      setStatus('error');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-[#0E1117] text-white rounded-xl shadow-2xl border border-gray-800 font-sans">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Zap size={24} className="text-blue-500" />
          Deploy to Edge
        </h2>
        <p className="text-gray-400 text-sm">Provision a new high-performance project directly to the global network.</p>
      </div>

      <form onSubmit={handleDeploy} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Project Name</label>
            <input
              type="text"
              name="projectName"
              value={formData.projectName}
              onChange={handleChange}
              placeholder="e.g., my-awesome-app"
              required
              className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Target Branch</label>
            <input
              type="text"
              name="targetBranch"
              value={formData.targetBranch}
              onChange={handleChange}
              placeholder="main"
              required
              className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">GitHub Username</label>
            <input
              type="text"
              name="githubUser"
              value={formData.githubUser}
              onChange={handleChange}
              required
              className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Repository Name</label>
            <input
              type="text"
              name="githubRepo"
              value={formData.githubRepo}
              onChange={handleChange}
              placeholder="e.g., EpicGlobal"
              required
              className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={status === 'loading'}
          className={`w-full py-3 px-4 mt-4 rounded-lg font-medium transition-all ${
            status === 'loading'
              ? 'bg-blue-600/50 text-blue-200 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg hover:shadow-blue-500/20'
          }`}
        >
          {status === 'loading' ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={20} className="animate-spin text-white" />
              Provisioning Edge Infrastructure...
            </span>
          ) : (
            'Deploy to Edge'
          )}
        </button>
      </form>

      {/* Status Feedback Banners */}
      {status === 'error' && (
        <div className="mt-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-3">
          <AlertCircle size={20} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-red-400 font-medium">Deployment Failed</h4>
            <p className="text-red-300 text-sm mt-1">{errorMessage}</p>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="mt-6 p-4 bg-green-500/10 border border-green-500/50 rounded-lg flex items-start gap-3">
          <CheckCircle2 size={20} className="text-green-500 mt-0.5 shrink-0" />
          <div className="w-full">
            <h4 className="text-green-400 font-medium">Platform Provisioned</h4>
            <p className="text-green-300/80 text-sm mt-1 mb-2">
              {deploymentTriggered
                ? 'A build has been triggered. Your site will be live in 2–5 minutes at:'
                : 'Project created. Push to your repo or trigger a deployment from the Cloudflare dashboard. It will be live at:'}
            </p>
            <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="block w-full bg-[#0E1117] text-blue-400 border border-green-500/30 rounded px-3 py-2 text-sm hover:text-blue-300 hover:border-green-500/50 transition-colors truncate">
              {resultUrl}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}