import EventEmitter from './Utils/EventEmitter.js'

export default class LapTimer extends EventEmitter
{
    constructor()
    {
        super()
        this._lapStart   = null
        this._bestLap    = this._loadBest()
        this._lapCount   = 0
        this._active     = false
        this._lastSign   = null
        this._gateOrigin = null  // { x, y }
        this._gateDir    = null  // { x, y } normalized, track forward direction
    }

    setGate(origin, dir)
    {
        this._gateOrigin = origin
        this._gateDir    = dir
    }

    start()
    {
        this._active   = true
        this._lapStart = performance.now()
        this._lastSign = null
    }

    stop()
    {
        this._active = false
    }

    tick(carBody)
    {
        if(!this._active || !this._gateOrigin || !this._gateDir) return

        const pos  = carBody.position
        const dx   = pos.x - this._gateOrigin.x
        const dy   = pos.y - this._gateOrigin.y
        const dot  = dx * this._gateDir.x + dy * this._gateDir.y
        const sign = dot >= 0 ? 1 : -1

        // Gate crossed going forward (negative → positive)
        if(this._lastSign === -1 && sign === 1)
        {
            this._onGateCrossed()
        }

        this._lastSign = sign
    }

    _onGateCrossed()
    {
        const now     = performance.now()
        const elapsed = this._lapStart !== null ? now - this._lapStart : 0

        // Ignore false triggers: car spawns at gate, needs to leave and return
        if(elapsed < 10000)
        {
            this._lapStart = now
            return
        }

        this._lapCount++
        const lapMs     = elapsed
        const isNewBest = this._bestLap === null || lapMs < this._bestLap

        if(isNewBest) this._saveBest(lapMs)

        this._lapStart = now

        this.trigger('lap', [{ lapMs, lapCount: this._lapCount, isNewBest, bestMs: this._bestLap }])
    }

    getCurrentMs()
    {
        if(!this._active || this._lapStart === null) return 0
        return performance.now() - this._lapStart
    }

    getBestMs()   { return this._bestLap  }
    getLapCount() { return this._lapCount }

    getDeltaMs()
    {
        if(this._bestLap === null || this._lapCount === 0) return null
        return this.getCurrentMs() - this._bestLap
    }

    _loadBest()
    {
        const v = localStorage.getItem('rg:bestLap')
        return v ? parseFloat(v) : null
    }

    _saveBest(ms)
    {
        localStorage.setItem('rg:bestLap', ms)
        this._bestLap = ms
    }

    static fmt(ms)
    {
        if(ms === null || ms === undefined || ms < 0) return '--:--.---'
        const totalS = Math.floor(ms / 1000)
        const m      = Math.floor(totalS / 60)
        const s      = totalS % 60
        const milli  = Math.floor(ms % 1000)
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(milli).padStart(3,'0')}`
    }
}
