import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadSubsystem } from '@/lib/data/subsystem-loader';
import CallFlowDiagram from '@/components/call-flow/CallFlowDiagram';
import { ArrowLeft } from 'lucide-react';

export default async function CallFlowPage({
  params,
}: {
  params: { subsystem: string; pathId: string };
}) {
  const subsystem = await loadSubsystem(params.subsystem);

  if (!subsystem) {
    notFound();
  }

  const callPath = subsystem.callPaths.find(cp => cp.id === params.pathId);

  if (!callPath) {
    notFound();
  }

  return (
    <main className="relative">
      {/* Back button */}
      <Link
        href={`/subsystems/${params.subsystem}`}
        className="absolute top-4 right-4 z-20 flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-shadow"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to {subsystem.name}</span>
      </Link>

      {/* Call flow diagram */}
      <CallFlowDiagram callPath={callPath} />
    </main>
  );
}
