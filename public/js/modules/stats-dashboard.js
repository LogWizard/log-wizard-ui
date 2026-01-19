/**
 * 🌿 Stats Dashboard
 * Handles fetching and rendering stats charts
 */
export class StatsDashboard {
    constructor() {
        this.modal = document.getElementById('stats-dashboard');
        this.charts = {}; // Store chart instances to destroy them before re-rendering
        this.initListeners();
    }

    initListeners() {
        // Open button
        const openBtn = document.getElementById('statsViewBtn');
        if (openBtn) {
            openBtn.addEventListener('click', () => this.show());
        }

        // Close button
        const closeBtn = document.getElementById('closeStatsBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        // Close on outside click
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // Days filter
        const daysSelect = document.getElementById('statsDaysSelect');
        if (daysSelect) {
            daysSelect.addEventListener('change', (e) => this.loadStats(e.target.value));
        }
    }

    show() {
        if (!this.modal) return;
        this.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent scroll
        this.loadStats(7); // Default 7 days
    }

    hide() {
        if (!this.modal) return;
        this.modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    async loadStats(days) {
        if (!this.modal) return;

        // Show loading overlay 🌿
        const body = this.modal.querySelector('.modal-body');
        const loader = document.createElement('div');
        loader.className = 'stats-loading-overlay';
        loader.innerHTML = `
            <div class="stats-loader"></div>
            <div style="font-weight: 600; letter-spacing: 1px;">AGGREGATING DATA... 🌿</div>
        `;
        body.appendChild(loader);

        try {
            const res = await fetch(`/api/stats?days=${days}`);
            if (!res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();

            // Artificial delay for smooth transition if data is too fast 🚬
            await new Promise(r => setTimeout(r, 600));

            this.renderCharts(data);
            loader.remove();
        } catch (error) {
            console.error('Stats load error:', error);
            loader.innerHTML = `<div style="color: #ff7675">❌ Error: ${error.message}</div>`;
        }
    }

    renderCharts(data) {
        this.destroyCharts();

        // Helper for gradients 🎨
        const getGradient = (ctx, color1, color2) => {
            const chartArea = ctx.canvas.getBoundingClientRect();
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, color1);
            gradient.addColorStop(1, color2);
            return gradient;
        };

        // 1. Messages Timeline (Line Chart)
        const ctxMsg = document.getElementById('chart-messages')?.getContext('2d');
        if (ctxMsg) {
            const grad = getGradient(ctxMsg, 'rgba(0, 136, 204, 0.5)', 'rgba(0, 136, 204, 0)');
            this.charts.msg = new Chart(ctxMsg.canvas, {
                type: 'line',
                data: {
                    labels: data.messagesByDay.map(d => d.date),
                    datasets: [{
                        label: 'Messages',
                        data: data.messagesByDay.map(d => d.count),
                        borderColor: '#00d2ff',
                        backgroundColor: grad,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#fff',
                        pointRadius: 4
                    }]
                },
                options: this.getChartOptions()
            });
        }

        // 2. Message Types (Doughnut) — Fixed legend 🌿
        const ctxTypes = document.getElementById('chart-types')?.getContext('2d');
        if (ctxTypes) {
            this.charts.types = new Chart(ctxTypes.canvas, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(data.msgTypes).map(t => t.toUpperCase()),
                    datasets: [{
                        data: Object.values(data.msgTypes),
                        backgroundColor: [
                            '#00d2ff', // Text
                            '#ff7675', // Photo
                            '#55efc4', // Sticker
                            '#ffeaa7', // Voice
                            '#a29bfe', // Video
                            '#fab1a0'  // Other
                        ],
                        borderWidth: 0,
                        hoverOffset: 15
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 15,
                                font: { size: 11, weight: '500' },
                                boxWidth: 12,
                                boxHeight: 12,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                color: '#8899a6'
                            }
                        }
                    }
                }
            });
        }

        // 3. Top Users (Bar H)
        const ctxUsers = document.getElementById('chart-users')?.getContext('2d');
        if (ctxUsers) {
            this.charts.users = new Chart(ctxUsers.canvas, {
                type: 'bar',
                data: {
                    labels: data.topUsers.map(u => u.name),
                    datasets: [{
                        label: 'Messages',
                        data: data.topUsers.map(u => u.count),
                        backgroundColor: '#55efc4',
                        borderRadius: 10,
                    }]
                },
                options: {
                    ...this.getChartOptions(),
                    indexAxis: 'y'
                }
            });
        }

        // 4. Top Commands (Bar)
        const ctxCmd = document.getElementById('chart-commands')?.getContext('2d');
        if (ctxCmd) {
            this.charts.cmd = new Chart(ctxCmd.canvas, {
                type: 'bar',
                data: {
                    labels: data.topCommands.map(c => c.cmd),
                    datasets: [{
                        label: 'Uses',
                        data: data.topCommands.map(c => c.count),
                        backgroundColor: '#ff7675',
                        borderRadius: 10,
                    }]
                },
                options: this.getChartOptions()
            });
        }

        // 5. Word Cloud (HTML)
        const cloudContainer = document.getElementById('word-cloud-container');
        if (cloudContainer) {
            const maxWeight = Math.max(...data.wordCloud.map(w => w.weight), 1);
            cloudContainer.innerHTML = data.wordCloud.map(w => {
                const weightRatio = w.weight / maxWeight;
                const size = 0.9 + (weightRatio * 1.5);
                const opacity = 0.4 + (weightRatio * 0.6);
                return `<span class="word-tag" style="font-size: ${size}em; opacity: ${opacity};" title="${w.weight} occurrences">${w.text}</span>`;
            }).join('');
        }
    }

    destroyCharts() {
        Object.values(this.charts).forEach(c => {
            if (c && typeof c.destroy === 'function') c.destroy();
        });
        this.charts = {};
    }

    getChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: { labels: { color: '#8899a6', font: { family: "'Inter', sans-serif", weight: '500' } } }
            },
            scales: {
                x: {
                    ticks: { color: '#8899a6' },
                    grid: { color: 'rgba(255,255,255,0.05)', borderColor: 'transparent' }
                },
                y: {
                    ticks: { color: '#8899a6' },
                    grid: { color: 'rgba(255,255,255,0.05)', borderColor: 'transparent' }
                }
            }
        };
    }
}

