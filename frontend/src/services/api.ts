const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export const api = {
  // Materials endpoints
  materials: {
    getAll: () => fetch(`${API_BASE_URL}/materials`),
    getById: (id: string) => fetch(`${API_BASE_URL}/materials/${id}`),
    create: (data: any) => fetch(`${API_BASE_URL}/materials`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetch(`${API_BASE_URL}/materials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetch(`${API_BASE_URL}/materials/${id}`, { method: 'DELETE' }),
  },

  // Projects endpoints
  projects: {
    getAll: () => fetch(`${API_BASE_URL}/projects`),
    getById: (id: string) => fetch(`${API_BASE_URL}/projects/${id}`),
    create: (data: any) => fetch(`${API_BASE_URL}/projects`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetch(`${API_BASE_URL}/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetch(`${API_BASE_URL}/projects/${id}`, { method: 'DELETE' }),
  },

  // Orders endpoints
  orders: {
    getAll: () => fetch(`${API_BASE_URL}/orders`),
    getById: (id: string) => fetch(`${API_BASE_URL}/orders/${id}`),
    create: (data: any) => fetch(`${API_BASE_URL}/orders`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetch(`${API_BASE_URL}/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetch(`${API_BASE_URL}/orders/${id}`, { method: 'DELETE' }),
  },

  // Customers endpoints
  customers: {
    getAll: () => fetch(`${API_BASE_URL}/customers`),
    getById: (id: string) => fetch(`${API_BASE_URL}/customers/${id}`),
    create: (data: any) => fetch(`${API_BASE_URL}/customers`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetch(`${API_BASE_URL}/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetch(`${API_BASE_URL}/customers/${id}`, { method: 'DELETE' }),
  },

  // Vendors endpoints
  vendors: {
    getAll: () => fetch(`${API_BASE_URL}/vendors`),
    getById: (id: string) => fetch(`${API_BASE_URL}/vendors/${id}`),
    create: (data: any) => fetch(`${API_BASE_URL}/vendors`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetch(`${API_BASE_URL}/vendors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetch(`${API_BASE_URL}/vendors/${id}`, { method: 'DELETE' }),
  },
};
