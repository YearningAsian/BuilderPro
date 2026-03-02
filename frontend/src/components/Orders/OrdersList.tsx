'use client';

export function OrdersList() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-8">Orders</h1>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Order ID</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Project</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Vendor</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t hover:bg-gray-50">
              <td className="px-6 py-4 text-gray-700">No orders yet</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
