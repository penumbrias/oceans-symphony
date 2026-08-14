/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	// Every text-* size multiplies by --v2-hmult, which is 1 everywhere
  	// EXCEPT on headings (index.css sets it from the user's Header size
  	// token on h1–h6/.font-display). Headings scale in proportion —
  	// each keeps its own designed size — and body text is untouched.
  	// Line heights scale with them so big headings don't clip.
  	fontSize: {
  		xs:   ['calc(0.75rem * var(--v2-hmult, 1))',  { lineHeight: 'calc(1rem * var(--v2-hmult, 1))' }],
  		sm:   ['calc(0.875rem * var(--v2-hmult, 1))', { lineHeight: 'calc(1.25rem * var(--v2-hmult, 1))' }],
  		base: ['calc(1rem * var(--v2-hmult, 1))',     { lineHeight: 'calc(1.5rem * var(--v2-hmult, 1))' }],
  		lg:   ['calc(1.125rem * var(--v2-hmult, 1))', { lineHeight: 'calc(1.75rem * var(--v2-hmult, 1))' }],
  		xl:   ['calc(1.25rem * var(--v2-hmult, 1))',  { lineHeight: 'calc(1.75rem * var(--v2-hmult, 1))' }],
  		'2xl': ['calc(1.5rem * var(--v2-hmult, 1))',  { lineHeight: 'calc(2rem * var(--v2-hmult, 1))' }],
  		'3xl': ['calc(1.875rem * var(--v2-hmult, 1))', { lineHeight: 'calc(2.25rem * var(--v2-hmult, 1))' }],
  		'4xl': ['calc(2.25rem * var(--v2-hmult, 1))', { lineHeight: 'calc(2.5rem * var(--v2-hmult, 1))' }],
  		'5xl': ['calc(3rem * var(--v2-hmult, 1))',    { lineHeight: '1' }],
  		'6xl': ['calc(3.75rem * var(--v2-hmult, 1))', { lineHeight: '1' }],
  		'7xl': ['calc(4.5rem * var(--v2-hmult, 1))',  { lineHeight: '1' }],
  		'8xl': ['calc(6rem * var(--v2-hmult, 1))',    { lineHeight: '1' }],
  		'9xl': ['calc(8rem * var(--v2-hmult, 1))',    { lineHeight: '1' }],
  	},
  	extend: {
  		fontFamily: {
  			sans: ['var(--font-sans)'],
  			display: ['var(--font-display)'],
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'var(--color-bg)',
  			foreground: 'var(--color-text-primary)',
  			card: {
  				DEFAULT: 'var(--color-surface)',
  				foreground: 'var(--color-text-primary)'
  			},
  			popover: {
  				DEFAULT: 'var(--color-surface)',
  				foreground: 'var(--color-text-primary)'
  			},
  			primary: {
  				DEFAULT: 'var(--color-primary)',
  				foreground: '#FFF'
  			},
  			secondary: {
  				DEFAULT: 'var(--color-secondary)',
  				foreground: 'var(--color-text-primary)'
  			},
  			muted: {
  				DEFAULT: 'var(--color-muted)',
  				foreground: 'var(--color-text-secondary)'
  			},
  			accent: {
  				DEFAULT: 'var(--color-accent)',
  				foreground: '#FFF'
  			},
  			destructive: {
  				DEFAULT: '#EF4444',
  				foreground: '#FFF'
  			},
  			border: 'var(--color-muted)',
  			input: 'var(--color-surface)',
  			ring: 'var(--color-primary)',
  			chart: {
  				'1': 'var(--color-primary)',
  				'2': 'var(--color-accent)',
  				'3': 'var(--color-secondary)',
  				'4': 'var(--color-muted)',
  				'5': 'var(--color-text-secondary)'
  			},
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}