import Link from 'next/link';
import { loadAllSubsystems } from '@/lib/data/subsystem-loader';
import { FileCode, Database, Activity, Cpu } from 'lucide-react';

export default async function HomePage() {
  const subsystems = await loadAllSubsystems();

  const icons: Record<string, any> = {
    vfs: FileCode,
    storage: Database,
    memory: Activity,
    scheduler: Cpu,
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Linux Kernel Subsystems
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Interactive documentation with animated call flow diagrams
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {subsystems.map((subsystem) => {
            const Icon = icons[subsystem.slug] || FileCode;

            return (
              <Link
                key={subsystem.id}
                href={`/subsystems/${subsystem.slug}`}
                className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-shadow border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                    <Icon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </div>

                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {subsystem.name}
                    </h2>

                    <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">
                          Call Paths
                        </div>
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {subsystem.callPaths.length}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">
                          Data Structures
                        </div>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {subsystem.dataStructures.length}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">
                          Core Files
                        </div>
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {subsystem.coreFiles.length}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {subsystems.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              No subsystems found. Make sure documentation files are in the parent directory.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
