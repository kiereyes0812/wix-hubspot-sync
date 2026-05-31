import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Code, Copy, CheckCheck, RefreshCw, FileText, Zap } from 'lucide-react';
import api from '../utils/api';

export default function FormIntegration() {
  const [selectedForm, setSelectedForm] = useState<string | null>(null);
  const [embedCode, setEmbedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'embed' | 'wix-push'>('embed');

  const { data: formsData, isLoading } = useQuery({
    queryKey: ['hubspot-forms'],
    queryFn: () => api.get('/forms/hubspot').then(r => r.data),
  });

  const forms = formsData?.forms || [];

  async function loadEmbed(formId: string) {
    setSelectedForm(formId);
    const { data } = await api.get(`/forms/hubspot/${formId}/embed`);
    setEmbedCode(data.embedCode);
  }

  async function copyCode() {
    if (!embedCode) return;
    await navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Form Integration</h1>
        <p className="text-zinc-500 mt-1">
          Capture leads via HubSpot forms embedded in Wix, or push Wix form submissions to HubSpot.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200">
        <TabButton active={activeTab === 'embed'} onClick={() => setActiveTab('embed')} icon={<Code size={14} />}>
          Embed HubSpot Form
        </TabButton>
        <TabButton active={activeTab === 'wix-push'} onClick={() => setActiveTab('wix-push')} icon={<Zap size={14} />}>
          Push Wix Submissions
        </TabButton>
      </div>

      {activeTab === 'embed' && (
        <div className="space-y-5">
          <div className="card p-5">
            <p className="text-sm text-zinc-600 mb-4">
              Select a HubSpot form to get its embed code. Paste this into your Wix page HTML/custom element.
              UTM parameters and referrer data are automatically captured.
            </p>

            {isLoading ? (
              <div className="flex items-center gap-2 text-zinc-400 text-sm">
                <RefreshCw size={14} className="animate-spin" /> Loading forms…
              </div>
            ) : forms.length === 0 ? (
              <div className="text-center py-8 text-zinc-400">
                <FileText size={28} className="mx-auto mb-2" />
                <p className="text-sm">No HubSpot forms found</p>
                <p className="text-xs mt-1">Create a form in HubSpot first</p>
              </div>
            ) : (
              <div className="space-y-2">
                {forms.map((form: any) => (
                  <button
                    key={form.id}
                    onClick={() => loadEmbed(form.id)}
                    className={`w-full text-left flex items-center justify-between p-3 rounded-lg border transition-all ${
                      selectedForm === form.id
                        ? 'border-blue-400 bg-blue-50 text-blue-800'
                        : 'border-zinc-200 hover:border-zinc-300 text-zinc-700'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{form.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 font-mono">{form.id}</p>
                    </div>
                    {selectedForm === form.id && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Selected</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {embedCode && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                <p className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                  <Code size={14} />
                  Embed Code
                </p>
                <button
                  className="btn-secondary text-xs py-1"
                  onClick={copyCode}
                >
                  {copied ? <CheckCheck size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-zinc-700 bg-zinc-900 text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                {embedCode}
              </pre>
              <div className="px-4 py-3 border-t border-zinc-200 bg-amber-50">
                <p className="text-xs text-amber-700">
                  <strong>Paste this in your Wix page</strong> using a Custom Element or HTML component.
                  Form submissions go directly to HubSpot and are also logged in your sync events.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'wix-push' && (
        <div className="space-y-5">
          <div className="card p-5">
            <p className="text-sm font-medium text-zinc-800 mb-2">How Wix Form Push Works</p>
            <p className="text-sm text-zinc-600 mb-4">
              On Wix form submission, your Wix backend (Velo) calls our API endpoint to create/update
              the HubSpot contact with full UTM attribution.
            </p>

            <div className="space-y-3">
              <StepCard step={1} title="Add trigger in Velo">
                In your Wix site backend, listen to form submission events using Wix Data hooks or the Forms API.
              </StepCard>
              <StepCard step={2} title="Call our sync endpoint">
                POST to <code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">/api/sync/form-submission</code> with form data.
              </StepCard>
              <StepCard step={3} title="Attribution captured">
                UTM params, page URL, and referrer are automatically attached to the HubSpot contact.
              </StepCard>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
              <Code size={14} className="text-zinc-500" />
              <p className="text-sm font-medium text-zinc-700">Wix Velo Example Code</p>
            </div>
            <pre className="p-4 text-xs font-mono bg-zinc-900 text-emerald-400 overflow-x-auto">{`// In your Wix Velo backend (e.g. http-functions.js or events.js)
import wixData from 'wix-data';
import { fetch } from 'wix-fetch';

export async function onFormSubmit(event) {
  const { fields, submission } = event;
  
  // Extract UTM params from page URL
  const pageUrl = event.pageUrl || '';
  const urlParams = new URLSearchParams(pageUrl.split('?')[1] || '');
  
  await fetch('https://your-backend.com/api/sync/form-submission', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_SESSION_TOKEN'
    },
    body: JSON.stringify({
      email: fields.email,
      name: \`\${fields.firstName} \${fields.lastName}\`,
      fields: {
        phone: fields.phone,
        company: fields.company,
      },
      attribution: {
        utm_source: urlParams.get('utm_source'),
        utm_medium: urlParams.get('utm_medium'),
        utm_campaign: urlParams.get('utm_campaign'),
        utm_term: urlParams.get('utm_term'),
        utm_content: urlParams.get('utm_content'),
        page_url: pageUrl,
        referrer: event.referrer || '',
      }
    })
  });
}`}</pre>
          </div>

          <div className="card p-5 bg-zinc-50">
            <p className="text-sm font-semibold text-zinc-700 mb-3">Attribution Properties in HubSpot</p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {[
                ['hs_analytics_source', 'utm_source'],
                ['hs_analytics_source_data_1', 'utm_medium'],
                ['hs_analytics_source_data_2', 'utm_campaign'],
                ['wix_utm_term', 'utm_term'],
                ['wix_utm_content', 'utm_content'],
                ['wix_page_url', 'page_url'],
                ['wix_referrer', 'referrer'],
                ['wix_form_submitted_at', 'submission timestamp'],
              ].map(([hs, desc]) => (
                <div key={hs} className="flex items-center gap-2 bg-white border border-zinc-200 rounded-md px-3 py-2">
                  <span className="text-orange-600">{hs}</span>
                  <span className="text-zinc-400">←</span>
                  <span className="text-zinc-500">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ children, active, onClick, icon }: {
  children: React.ReactNode; active: boolean; onClick: () => void; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function StepCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {step}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-800">{title}</p>
        <p className="text-sm text-zinc-500 mt-0.5">{children}</p>
      </div>
    </div>
  );
}
