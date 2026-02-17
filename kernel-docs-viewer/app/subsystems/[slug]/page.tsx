import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadSubsystem, getSubsystemSlugs } from '@/lib/data/subsystem-loader';
import { ArrowRight, Play } from 'lucide-react';

export async function generateStaticParams() {
  const slugs = await getSubsystemSlugs();
  return slugs.map(slug => ({ slug }));
}

export default async function SubsystemPage({
  params,
}: {
  params: { slug: string };
}) {
  const subsystem = await loadSubsystem(params.slug);

  if (!subsystem) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block"
          >
            ← Back to all subsystems
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {subsystem.name} Subsystem
          </h1>
        </div>

        {/* Call Paths Section */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
            Call Flow Diagrams
          </h2>

          {subsystem.callPaths.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {subsystem.callPaths.map((callPath) => (
                <Link
                  key={callPath.id}
                  href={`/call-flow/${subsystem.slug}/${callPath.id}`}
                  className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {callPath.title}
                      </h3>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {callPath.steps.length} step{callPath.steps.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <Play className="w-5 h-5" />
                      <span className="text-sm font-medium">View Animation</span>
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">
              No call paths available for this subsystem.
            </p>
          )}
        </section>

        {/* Data Structures Section */}
        {subsystem.dataStructures.length > 0 && (
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
              Core Data Structures
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {subsystem.dataStructures.map((struct) => (
                <div
                  key={struct.id}
                  className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700"
                >
                  <h3 className="text-lg font-mono font-bold text-gray-900 dark:text-white mb-2">
                    {struct.name}
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {struct.file}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {struct.purpose}
                  </p>
                  <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    {struct.fields.length} field{struct.fields.length !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Core Files Section */}
        {subsystem.coreFiles.length > 0 && (
          <section>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
              Core Files
            </h2>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      File Path
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Purpose
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {subsystem.coreFiles.map((file, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                        {file.path}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {file.purpose}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
