/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
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