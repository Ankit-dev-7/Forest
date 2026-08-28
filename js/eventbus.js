/**
 * js/eventbus.js — Shared EventBus singleton
 *
 * Extracted from main.js to break the circular dependency:
 *   main.js ↔ loader.js
 *
 * All modules that need pub/sub should import from this file,
 * NOT from main.js.
 */

/** @type {Map<string, Set<Function>>} */
const _listeners = new Map();

export const EventBus = {
  /**
   * Subscribe to an event.
   * @param {string}   event
   * @param {Function} fn
   */
  on(event, fn) {
    if (!_listeners.has(event)) {
      _listeners.set(event, new Set());
    }
    _listeners.get(event).add(fn);
  },

  /**
   * Unsubscribe from an event.
   * @param {string}   event
   * @param {Function} fn
   */
  off(event, fn) {
    if (_listeners.has(event)) {
      _listeners.get(event).delete(fn);
    }
  },

  /**
   * Emit an event with an optional payload.
   * @param {string} event
   * @param {*}      [payload]
   */
  emit(event, payload) {
    if (_listeners.has(event)) {
      for (const fn of _listeners.get(event)) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[EventBus] Error in handler for "${event}":`, err);
        }
      }
    }
  },
};
