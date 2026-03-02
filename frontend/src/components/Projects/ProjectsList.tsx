'use client';

export function ProjectsList() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-8">Projects</h1>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Project Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Customer</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t hover:bg-gray-50">
              <td className="px-6 py-4 text-gray-700">No projects yet</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
