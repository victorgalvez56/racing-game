import LapTimer from './LapTimer.js'

const LB_KEY     = 'rg:lapTimes'
const LB_MAX     = 5
const LB_SHOW_MS = 5000

export default class HUD
{
    constructor(_options)
    {
        this.lapTimer = _options.lapTimer
        this.physics  = _options.physics

        this.$hud   = document.getElementById('race-hud')
        this.$lap   = document.getElementById('hud-lap')
        this.$time  = document.getElementById('hud-time')
        this.$best  = document.getElementById('hud-best')
        this.$delta = document.getElementById('hud-delta')
        this.$speed = document.getElementById('hud-speed')
        this.$note  = document.getElementById('hud-lap-note')
        this.$lb    = document.getElementById('leaderboard')
        this.$lbList= document.getElementById('lb-list')
        this.$gear  = document.getElementById('hud-gear')

        this._noteTimer = null
        this._lbTimer   = null

        this._times = this._loadTimes()
        this._renderLeaderboard()

        this.lapTimer.on('lap', ({ lapMs, lapCount, isNewBest }) =>
        {
            this._onLap(lapMs, lapCount, isNewBest)
        })

        this.lapTimer.on('sector', ({ sectorIdx, sectorMs, isNewBest, bestMs }) =>
        {
            this._onSector(sectorIdx, sectorMs, isNewBest, bestMs)
        })
    }

    show()
    {
        if(this.$hud)   this.$hud.style.display   = 'flex'
        if(this.$speed) this.$speed.style.display = 'block'
        if(this.$gear)  this.$gear.style.display  = 'block'
    }

    update()
    {
        if(!this.$hud) return

        const currentMs = this.lapTimer.getCurrentMs()
        const bestMs    = this.lapTimer.getBestMs()
        const delta     = this.lapTimer.getDeltaMs()
        const lapCount  = this.lapTimer.getLapCount()

        if(this.$time)
            this.$time.textContent = LapTimer.fmt(currentMs)

        if(this.$lap)
            this.$lap.textContent = `LAP ${lapCount + 1}`

        if(this.$best)
            this.$best.textContent = bestMs !== null ? `BEST  ${LapTimer.fmt(bestMs)}` : ''

        if(this.$delta)
        {
            if(delta !== null && lapCount > 0)
            {
                const sign = delta > 0 ? '+' : ''
                this.$delta.textContent = `${sign}${(delta / 1000).toFixed(3)}s`
                this.$delta.style.color = delta > 0 ? '#e74c3c' : '#2ecc71'
            }
            else
            {
                this.$delta.textContent = ''
            }
        }

        if(this.$speed && this.physics)
        {
            const vel = this.physics.car.chassis.body.velocity
            const kmh = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2) * 3.6
            this.$speed.textContent = `${Math.round(kmh)}`

            if(this.$gear)
            {
                const thresholds = [0, 22, 46, 76, 112, 150]
                let gear = 1
                for(let g = thresholds.length - 1; g >= 0; g--)
                {
                    if(kmh >= thresholds[g]) { gear = g + 1; break }
                }
                this.$gear.textContent = `G${gear}`
            }
        }
    }

    // ── Leaderboard ────────────────────────────────────────────────────────

    _loadTimes()
    {
        try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]') }
        catch { return [] }
    }

    _saveTimes()
    {
        localStorage.setItem(LB_KEY, JSON.stringify(this._times))
    }

    _recordTime(ms)
    {
        this._times.push(ms)
        this._times.sort((a, b) => a - b)
        this._times = this._times.slice(0, LB_MAX)
        this._saveTimes()
    }

    _renderLeaderboard()
    {
        if(!this.$lbList) return
        this.$lbList.innerHTML = ''
        const best = this._times[0] ?? null

        this._times.forEach((ms, i) =>
        {
            const li = document.createElement('li')
            if(ms === best) li.className = 'lb-best'

            const rank = document.createElement('span')
            rank.className   = 'lb-rank'
            rank.textContent = `#${i + 1}`

            const time = document.createElement('span')
            time.className   = 'lb-time'
            time.textContent = LapTimer.fmt(ms)

            li.appendChild(rank)
            li.appendChild(time)
            this.$lbList.appendChild(li)
        })
    }

    _showLeaderboard()
    {
        if(!this.$lb) return
        this.$lb.classList.add('visible')
        clearTimeout(this._lbTimer)
        this._lbTimer = setTimeout(() =>
        {
            this.$lb.classList.remove('visible')
        }, LB_SHOW_MS)
    }

    // ── Lap event ─────────────────────────────────────────────────────────

    _onLap(lapMs, lapCount, isNewBest)
    {
        if(this.$lap) this.$lap.textContent = `LAP ${lapCount + 1}`

        this._recordTime(lapMs)
        this._renderLeaderboard()
        this._showLeaderboard()

        const msg   = isNewBest
            ? `🏆  NEW BEST!  ${LapTimer.fmt(lapMs)}`
            : `Lap ${lapCount}  ·  ${LapTimer.fmt(lapMs)}`
        this._showNote(msg, isNewBest ? '#f1c40f' : '#fff')

        if(isNewBest && this.$time)
        {
            this.$time.style.color = '#f1c40f'
            setTimeout(() => { if(this.$time) this.$time.style.color = '' }, 1800)
        }
    }

    showBoost()
    {
        this._showNote('⚡ BOOST!', '#ffaa00')
    }

    _onSector(idx, sectorMs, isNewBest, bestMs)
    {
        const label = `S${idx + 1}`
        if(isNewBest)
        {
            this._showNote(`🟣 ${label}  ${LapTimer.fmt(sectorMs)}`, '#cc88ff')
        }
        else if(bestMs !== null)
        {
            const delta = sectorMs - bestMs
            const sign  = delta > 0 ? '+' : ''
            const color = delta > 0 ? '#e74c3c' : '#2ecc71'
            this._showNote(`${label}  ${sign}${(delta / 1000).toFixed(3)}s`, color)
        }
        else
        {
            this._showNote(`${label}  ${LapTimer.fmt(sectorMs)}`, '#fff')
        }
    }

    _showNote(text, color)
    {
        if(!this.$note) return
        this.$note.textContent   = text
        this.$note.style.color   = color
        this.$note.style.opacity = '1'
        clearTimeout(this._noteTimer)
        this._noteTimer = setTimeout(() =>
        {
            if(this.$note) this.$note.style.opacity = '0'
        }, 3200)
    }
}
