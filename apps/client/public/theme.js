try {
  const value = JSON.parse(localStorage.getItem('fanphoto.preferences') || '{}').theme
  const theme =
    value === 'light' || value === 'dark'
      ? value
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
} catch {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}
