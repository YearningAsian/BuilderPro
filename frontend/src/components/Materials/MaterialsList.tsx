'use client';

export function MaterialsList() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-8">Materials Inventory</h1>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Unit Type</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Unit Cost</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">SKU</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t hover:bg-gray-50">
              <td className="px-6 py-4 text-gray-700">No materials yet</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
