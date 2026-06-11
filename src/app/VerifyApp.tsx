import { UtilityBar } from './components/UtilityBar';
import { Header } from './components/Header';
import { TitleBlock } from './components/TitleBlock';
import { UploadCard } from './components/UploadCard';
import { DocumentPreview } from './components/DocumentPreview';
import { ReportPanel } from './components/ReportPanel';
import { DevControls } from './components/DevControls';
import { useValidation } from './hooks/useValidation';

export function VerifyApp() {
  const v = useValidation();
  const fileName = v.file?.name ?? 'document';

  return (
    <div className="min-h-screen bg-paper" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <UtilityBar />
      <Header />
      <TitleBlock />

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-132px)]">
        <div className="w-full border-b border-rule lg:w-[400px] lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="p-6 lg:p-8">
            <UploadCard
              phase={v.phase}
              file={v.file}
              onFile={v.setFile}
              onRun={v.runValidation}
            />
            {v.file && (
              <DocumentPreview
                file={v.file}
                results={v.results}
                isAnalyzing={v.phase === 'analyzing'}
              />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <ReportPanel
            phase={v.phase}
            fileName={fileName}
            results={v.results}
            verdict={v.verdict}
            onReset={v.reset}
          />
        </div>
      </div>

      <DevControls
        scenarioId={v.scenarioId}
        customOverrides={v.customOverrides}
        latencyMs={v.latencyMs}
        useRealMeta={v.useRealMeta}
        thresholds={v.thresholds}
        forceVerdict={v.forceVerdict}
        onScenario={v.setScenario}
        onCustomOverride={v.setCustomOverride}
        onLatency={v.setLatencyMs}
        onUseRealMeta={v.setUseRealMeta}
        onThreshold={v.setThreshold}
        onForceVerdict={v.setForceVerdict}
        onReset={v.devReset}
      />
    </div>
  );
}
