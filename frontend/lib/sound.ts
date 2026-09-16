"use client";

let audioEl: HTMLAudioElement | null = null;
let unlocked = false;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio("/sounds/notification.wav");
    audioEl.preload = "auto";
  }
  return audioEl;
}

/**
 * Browser modern memblokir audio.play() otomatis sebelum ada interaksi user
 * di halaman (autoplay policy). Trik umum: mainkan sekali (volume 0, langsung
 * pause) begitu user melakukan interaksi pertama apa pun (klik/tap), supaya
 * origin ini "diizinkan" memutar audio secara terprogram setelahnya.
 */
export function primeNotificationSound() {
  if (unlocked || typeof window === "undefined") return;
  const unlock = () => {
    const audio = getAudio();
    if (audio) {
      audio.volume = 0;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        unlocked = true;
      }).catch(() => {
        // Masih gagal - coba lagi di interaksi berikutnya.
      });
    }
    window.removeEventListener("click", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("click", unlock);
  window.addEventListener("touchstart", unlock);
  window.addEventListener("keydown", unlock);
}

export function playNotificationSound() {
  const audio = getAudio();
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch((err) => {
    console.warn("Gagal memutar suara notifikasi (mungkin belum ada interaksi user):", err);
  });
}
