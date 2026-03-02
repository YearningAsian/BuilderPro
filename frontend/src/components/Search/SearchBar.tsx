'use client';

import { useState } from 'react';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'materials' | 'projects' | 'orders'>('materials');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search logic will be implemented here
  };

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-8">Advanced Search</h1>
      <form onSubmit={handleSearch} className="bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Search Type</label>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="materials">Materials</option>
              <option value="projects">Projects</option>
              <option value="orders">Orders</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Query</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter search term..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Search
        </button>
      </form>
      <div className="mt-8">
        <p className="text-gray-600">No search results yet</p>
      </div>
    </div>
  );
}
