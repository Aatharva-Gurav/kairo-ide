(function () {
  try {
    var theme = localStorage.getItem("kairo:active_theme");
    if (!theme) {
      var candidateKeys = [
        "kairo.settings.local",
        "kairo.settings.guest",
        "kairo:user_settings",
      ];
      for (var i = 0; i < candidateKeys.length; i++) {
        var raw = localStorage.getItem(candidateKeys[i]);
        if (!raw) continue;
        try {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.appearance && parsed.appearance.theme) {
            theme = parsed.appearance.theme;
            break;
          }
        } catch {}
      }
    }
    if (!theme) {
      theme = "dark-modern";
    }
    var migrationMap = {
      dark: "dark-modern",
      "github-dark": "dark-modern",
      light: "light-modern",
      "vs-dark": "vs-dark",
      "vs-light": "vs-light",
      "one-dark-pro": "graphite",
      dracula: "midnight-blue",
      "tokyo-night": "midnight-blue",
      monokai: "forest-dark",
    };
    if (migrationMap[theme]) {
      theme = migrationMap[theme];
    }
    var isDark = true;
    if (theme === "system") {
      isDark = window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : true;
      theme = isDark ? "dark-modern" : "light-modern";
    } else {
      var lightThemes = [
        "light-modern",
        "light-plus",
        "vs-light",
        "hc-light",
        "arctic-blue",
        "warm-sand",
        "mint-light",
      ];
      isDark = lightThemes.indexOf(theme) === -1;
    }
    if (isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("kairo-light");
      document.documentElement.classList.add("kairo-dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.remove("kairo-dark");
      document.documentElement.classList.add("kairo-light");
    }
    document.documentElement.setAttribute("data-theme", theme);
  } catch {}
})();
