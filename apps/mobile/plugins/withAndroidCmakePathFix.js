const { withProjectBuildGradle } = require("@expo/config-plugins");

const CMAKE_FIX_MARKER = "CMAKE_OBJECT_PATH_MAX=1024";
const CMAKE_FIX_BLOCK = `
// Windows: long node_modules paths (Bun/.bun) exceed CMake's default object path limit.
subprojects { subproject ->
  subproject.plugins.withId("com.android.library") {
    subproject.afterEvaluate {
      def androidExt = subproject.extensions.findByName("android")
      if (androidExt == null) return
      def cmake = androidExt.defaultConfig.externalNativeBuild?.cmake
      if (cmake == null) return
      cmake.arguments "-DCMAKE_OBJECT_PATH_MAX=1024"
    }
  }
  subproject.plugins.withId("com.android.application") {
    subproject.afterEvaluate {
      def androidExt = subproject.extensions.findByName("android")
      if (androidExt == null) return
      def cmake = androidExt.defaultConfig.externalNativeBuild?.cmake
      if (cmake == null) return
      cmake.arguments "-DCMAKE_OBJECT_PATH_MAX=1024"
    }
  }
}
`;

/** @type {import('@expo/config-plugins').ConfigPlugin} */
module.exports = function withAndroidCmakePathFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      return config;
    }
    if (config.modResults.contents.includes(CMAKE_FIX_MARKER)) {
      return config;
    }
    config.modResults.contents += CMAKE_FIX_BLOCK;
    return config;
  });
};
