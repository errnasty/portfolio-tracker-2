'use client'

import { useEffect } from 'react'

// IntersectionObserver-based scroll reveal. Add `data-reveal` to any element
// and it will fade+rise into view when scrolled to. Optional `data-reveal-delay`
// sets a per-element delay in ms. Used by the landing page and dashboard panels.
export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    if (!els.length) return

    // Set initial hidden state
    els.forEach((el) => {
      const htmlEl = el as HTMLElement
      const delay = htmlEl.dataset.revealDelay
      htmlEl.style.opacity = '0'
      htmlEl.style.transform = 'translateY(36px)'
      htmlEl.style.transition = `opacity 0.85s cubic-bezier(0.2,0.7,0.2,1), transform 0.85s cubic-bezier(0.2,0.7,0.2,1)`
      if (delay) htmlEl.style.transitionDelay = `${delay}ms`
    })

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const el = e.target as HTMLElement
          el.style.opacity = '1'
          el.style.transform = 'none'
          io.unobserve(e.target)
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })

    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}
