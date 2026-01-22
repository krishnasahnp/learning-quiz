const API_ROUTES = Object.freeze({
    list: '/reflections',
    add: '/add_reflection',
    update: (entryId) => `/reflections/${encodeURIComponent(entryId)}`,
    remove: (entryId) => `/reflections/${encodeURIComponent(entryId)}`,
    search: '/reflections/search'
});

let lastFilters = {};
let editModalState = {
    entryId: null,
    data: null,
};
const PENDING_QUEUE_KEY = 'pendingReflections';
let isFlushingPending = false;

document.addEventListener('DOMContentLoaded', () => {
    loadReflections();
    setupFormSubmission();
    setupSearchControls();
    setupEditModal();
    flushPendingEntries();
    window.addEventListener('online', flushPendingEntries);
});

function setupFormSubmission() {
    const form = document.getElementById('journalForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const submitButton = form.querySelector('[type="submit"]');
        submitButton?.setAttribute('disabled', 'disabled');

        const formData = new FormData(form);
        const tech = [];
        form.querySelectorAll('input[name="tech"]:checked').forEach(cb => tech.push(cb.value));

        const entry = {
            week: formData.get('week'),
            title: formData.get('journalName'),
            date: formData.get('date'),
            taskName: formData.get('taskName'),
            reflection: formData.get('taskDescription'),
            location: {
                lat: formData.get('geoLat'),
                lon: formData.get('geoLon'),
                address: formData.get('geoAddress')
            },
            tech
        };

        try {
            if (!navigator.onLine) {
                queuePendingEntry(entry);
                alert('You are offline. The entry has been saved locally and will sync when you are back online.');
                form.reset();
                return;
            }

            const response = await fetch(API_ROUTES.add, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(entry)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Unable to save reflection');
            }

            form.reset();
            alert('Journal entry saved successfully!');
            await loadReflections();
        } catch (error) {
            console.error('Error submitting form:', error);
            alert(`Error submitting form. ${error.message}`);
        } finally {
            submitButton?.removeAttribute('disabled');
        }
    });
}

async function loadReflections(filters) {
    if (typeof filters === 'undefined') {
        filters = lastFilters;
    }

    filters = filters || {};
    lastFilters = filters;

    const journalList = document.getElementById('userJournalList');
    const counterDisplay = document.getElementById('reflectionCounter');

    if (!journalList) return;

    try {
        let url = API_ROUTES.list;
        const params = new URLSearchParams();

        if (filters.query) params.set('q', filters.query);
        if (filters.week) params.set('week', filters.week);
        if (filters.tech) params.set('tech', filters.tech);

        if ([...params.keys()].length > 0) {
            url = `${API_ROUTES.search}?${params.toString()}`;
        }

        const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reflections = await response.json();

        if (counterDisplay) {
            counterDisplay.textContent = `${reflections.length} Entries`;
        }

        journalList.innerHTML = '';

        reflections.sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp));

        reflections.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'journal-card fade-in visible';

            const entryId = entry.timestamp || `${entry.week}-${entry.date}-${entry.taskName}`;
            card.dataset.entryId = entryId;

            const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
            const formattedDate = entry.date ? new Date(entry.date).toLocaleDateString('en-US', dateOptions) : 'Date not specified';

            const tagsHtml = Array.isArray(entry.tech)
                ? entry.tech.map(t => `<span class="tag">${t}</span>`).join('')
                : '';

            let locationHtml = '';
            if (entry.location) {
                if (entry.location.address) {
                    locationHtml = `<p style="color:var(--gray); font-size: 0.9em; margin-top: 0.5rem;">📍 ${entry.location.address}</p>`;
                } else if (entry.location.lat && entry.location.lon) {
                    locationHtml = `<p style="color:var(--gray); font-size: 0.9em; margin-top: 0.5rem;">📍 ${entry.location.lat}, ${entry.location.lon}</p>`;
                }
            }

            card.innerHTML = `
                <div class="journal-header">
                    <span class="week-badge">Week ${entry.week}</span>
                    <h3>${entry.title}</h3>
                    <p class="journal-date">${formattedDate}</p>
                </div>
                <div class="journal-body">
                    <div class="journal-question">
                        <h4>Task: ${entry.taskName || 'Journal Entry'}</h4>
                        <p>${entry.reflection}</p>
                    </div>
                    ${locationHtml}
                    <div class="journal-tags">
                        ${tagsHtml}
                    </div>
                </div>
            `;

            const actions = document.createElement('div');
            actions.className = 'entry-actions';

            if (entryId) {
                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'btn btn-outline';
                editBtn.textContent = 'Edit';
                editBtn.addEventListener('click', () => openEditModal(entryId, entry));
                actions.appendChild(editBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'btn btn-danger';
                deleteBtn.textContent = 'Delete';
                deleteBtn.addEventListener('click', () => handleDelete(entryId));
                actions.appendChild(deleteBtn);
            }

            card.appendChild(actions);
            journalList.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading reflections:', error);
        journalList.innerHTML = '<p style="text-align:center; color: var(--gray);">Unable to load reflections from the server.</p>';
    }
}

async function handleDelete(entryId) {
    const confirmed = confirm('Delete this reflection? This cannot be undone.');
    if (!confirmed) return;

    try {
        const response = await fetch(API_ROUTES.remove(entryId), {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete reflection');
        }

        await loadReflections();
    } catch (error) {
        console.error('Error deleting reflection:', error);
        alert(`Unable to delete reflection. ${error.message}`);
    }
}

function setupSearchControls() {
    const queryInput = document.getElementById('searchQuery');
    const weekInput = document.getElementById('searchWeek');
    const techInput = document.getElementById('searchTech');
    const searchButton = document.getElementById('searchButton');
    const resetButton = document.getElementById('resetSearchButton');

    if (!queryInput || !weekInput || !techInput || !searchButton || !resetButton) return;

    const executeSearch = () => {
        const filters = {
            query: queryInput.value.trim(),
            week: weekInput.value.trim(),
            tech: techInput.value.trim()
        };

        Object.keys(filters).forEach(key => {
            if (!filters[key]) {
                delete filters[key];
            }
        });

        loadReflections(filters);
    };

    searchButton.addEventListener('click', executeSearch);
    queryInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') executeSearch();
    });

    resetButton.addEventListener('click', () => {
        queryInput.value = '';
        weekInput.value = '';
        techInput.value = '';
        loadReflections({});
    });
}

function setupEditModal() {
    const modal = document.getElementById('editModal');
    const form = document.getElementById('editForm');
    const closeButtons = document.querySelectorAll('[data-close-edit]');

    if (!modal || !form) return;

    closeButtons.forEach(btn => btn.addEventListener('click', () => closeEditModal()));
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeEditModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeEditModal();
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!editModalState.entryId) return;

        const payload = collectEditFormData(form);
        if (!payload) return;

        try {
            const response = await fetch(API_ROUTES.update(editModalState.entryId), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || 'Failed to update reflection');
            }

            closeEditModal();
            await loadReflections();
        } catch (error) {
            console.error('Error updating reflection:', error);
            alert(`Unable to update reflection. ${error.message}`);
        }
    });
}

function openEditModal(entryId, entry) {
    const modal = document.getElementById('editModal');
    const form = document.getElementById('editForm');
    if (!modal || !form) return;

    editModalState.entryId = entryId;
    editModalState.data = entry;

    form.querySelector('#editWeek').value = entry.week || '';
    form.querySelector('#editTitle').value = entry.title || '';
    form.querySelector('#editDate').value = entry.date || '';
    form.querySelector('#editTaskName').value = entry.taskName || '';
    form.querySelector('#editReflection').value = entry.reflection || '';
    form.querySelector('#editLocationAddress').value = entry.location?.address || '';
    form.querySelector('#editLocationLat').value = entry.location?.lat || '';
    form.querySelector('#editLocationLon').value = entry.location?.lon || '';

    const tech = entry.tech || [];
    form.querySelectorAll('input[name="editTech"]').forEach(cb => {
        cb.checked = tech.includes(cb.value);
    });

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    const form = document.getElementById('editForm');
    if (!modal || !form) return;

    form.reset();
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    editModalState.entryId = null;
    editModalState.data = null;
}

function collectEditFormData(form) {
    const week = form.querySelector('#editWeek').value.trim();
    const title = form.querySelector('#editTitle').value.trim();
    const date = form.querySelector('#editDate').value.trim();
    const taskName = form.querySelector('#editTaskName').value.trim();
    const reflection = form.querySelector('#editReflection').value.trim();

    if (!week || !title || !date || !taskName || !reflection) {
        alert('Please complete all required fields.');
        return null;
    }

    const tech = Array.from(form.querySelectorAll('input[name="editTech"]:checked')).map(cb => cb.value);

    return {
        week,
        title,
        date,
        taskName,
        reflection,
        tech,
        location: {
            address: form.querySelector('#editLocationAddress').value.trim(),
            lat: form.querySelector('#editLocationLat').value.trim(),
            lon: form.querySelector('#editLocationLon').value.trim(),
        }
    };
}

function getPendingQueue() {
    try {
        const raw = localStorage.getItem(PENDING_QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (_) {
        return [];
    }
}

function savePendingQueue(queue) {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
}

function queuePendingEntry(entry) {
    const queue = getPendingQueue();
    queue.push({ ...entry, queuedAt: new Date().toISOString() });
    savePendingQueue(queue);
}

async function flushPendingEntries() {
    if (!navigator.onLine || isFlushingPending) return;
    const queue = getPendingQueue();
    if (!queue.length) return;

    isFlushingPending = true;
    try {
        for (let i = 0; i < queue.length; i += 1) {
            const entry = queue[i];
            const response = await fetch(API_ROUTES.add, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            });
            if (!response.ok) {
                throw new Error(`Failed to sync entry ${entry.title || ''}`);
            }
            queue.splice(i, 1);
            i -= 1; // adjust index after removal
            savePendingQueue(queue);
        }
        if (queue.length === 0) {
            await loadReflections();
            const banner = document.getElementById('connectionBanner');
            if (banner) {
                const text = banner.querySelector('.status-text');
                if (text) {
                    text.textContent = 'Offline entries synced successfully.';
                    banner.classList.remove('hidden');
                    setTimeout(() => banner.classList.add('hidden'), 3000);
                }
            }
        }
    } catch (error) {
        console.error('Error syncing pending entries:', error);
    } finally {
        isFlushingPending = false;
    }
}
