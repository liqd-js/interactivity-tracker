const INTERACTIVITY = [ 'idle', 'read', 'write' ];
const SESSION_EXPIRATION = 30 * 60 * 1000;

function ID(){ return ( Date.now() / 1000 | 0 ).toString(16) + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, () => (Math.random() * 16 | 0).toString(16)).toLowerCase()}

class PageView
{
    constructor( sessionID, name, options )
    {
        this._options = options;
        this._timeout = undefined;

        this.state = 'read';
        this.changed = Date.now();
        
        this.sessionID = sessionID;
        this.id = ID();
        this.url = location.href;
        this.name = name || document.title;
        this.timeline = '';
        this.states = { idle: 0, read: 0, write: 0, interactive: 0 };

        this.interaction( 'read', true );
    }

    interaction( state, force )
    {
        if( this._state !== state && ( force || INTERACTIVITY.indexOf( state ) > INTERACTIVITY.indexOf( this._state )))
        {
            if( this._state !== state )
            {
                let now = Date.now(), duration = ( now - this._changed ) / 1000, notable = duration >= 0.5;

                if( this._state !== 'idle' )
                {
                    this.states[ this._state ] += duration;
                    this.states.interactive += duration;
                }

                this.states[ this._state ] += duration;
                this._state !== 'idle' && ( this.states.interactive += duration );

                if( notable )
                {
                    this.timeline += this._state.substring(0,1) + Math.round( duration );
                    navigator.sendBeacon( this._options.trackerURL, 
                    {
                        sessionID,
                        id      : this.id,
                        user    : this._options.user,
                        url     : this.url,
                        referrer: this._options.referrer || document.referrer,
                        device  : { width: window.innerWidth, height: window.innerHeight },
                        interaction: 
                        {
                            timeline: this.timeline,
                            states  : this.states,
                        }
                    });
                }

                this._changed = now;
                this._state = state;
            }

            sessionStorage.setItem( 'session-tracker-expires', SESSION_EXPIRATION );
        }

        if( this._state !== 'idle' )
        {
            this._timeout && clearTimeout( this._timeout );
            this._timeout = setTimeout( this.interaction.bind( this, INTERACTIVITY[ INTERACTIVITY.indexOf( state ) - 1 ]), this._options.timeout[ this._state ] || 1000 );
        }
    }

    end()
    {
        this.interactivity( 'idle' );
    }

    clone( sessionID )
    {
        return new PageView( sessionID, this.name, this._options );
    }
}

class Session
{
    constructor()
    {
        this.id = localStorage.getItem( 'session-tracker-id' );

        if( !this.id || ( localStorage.getItem( 'session-tracker-expires' ) || Infinity ) < Date.now() )
        {
            this.id = ID();
            localStorage.setItem( 'session-tracker-id', this.id );
        }
    }

    _isExpired()
    {
        if( this.pageView.state === 'idle' && this.pageView.changed < Date.now() - SESSION_EXPIRATION )
        {
            this.id = ID();
            localStorage.setItem( 'session-tracker-id', this.id );

            return true;
        }

        return false;
    }

    page( pageName, pageOptions )
    {
        const expired = this._isExpired();

        if( expired || !this.pageView || this.pageView.url !== location.href )
        {
            !expired && this.pageView && this.pageView.end();
            this.pageView = new PageView( this.id, pageName, { ...options, ...pageOptions });
        }

        this.pageView.interaction( document.visibilityState !== 'hidden' ? 'read' : 'idle' );
    }

    interaction( state, force )
    {
        if( !this.pageView ){ return }
        if( this._isExpired() )
        {
            this.pageView = this.pageView.clone( this.id );
        }

        this.pageView.interaction( state, force );
    }
}

class SessionTracker
{
    static _options;
    static _session;

    static init( pageName, options = { trackerURL: '', user: {}, timeout: { read: 30000, write: 5000 }})
    {
        SessionTracker._options = options;
        SessionTracker._session = new Session( pageName, options );

        function bind( element, event, state, force )
        {
            element.addEventListener( event, () => SessionTracker._session.interaction( state, force ), { capture: true, passive: true });
        }

        bind( document, 'click',        'read' );
        bind( document, 'scroll',       'read' );
        bind( document, 'mousemove',    'read' );
        bind( document, 'keypress',     'write' );
        bind( window,   'blur',         'idle', true );
        bind( window,   'focus',        'read' );
        bind( window,   'beforeunload', 'idle', true );
    }

    static page( pageName, pageOptions = {})
    {
        SessionTracker._session.page( pageName, pageOptions );   
    }
}