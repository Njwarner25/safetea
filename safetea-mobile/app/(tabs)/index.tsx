import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '../../constants/colors';

const LINKHER_PINK = '#E91E8C';
const LINKHER_PURPLE = '#9C27B0';

const REBRAND_CSS = `
  :root {
    --safetea-green: ${LINKHER_PINK} !important;
    --brand-primary: ${LINKHER_PINK} !important;
    --brand-secondary: ${LINKHER_PURPLE} !important;
  }
  [style*="#1B5E20"], [style*="#2E7D32"], [style*="#388E3C"],
  [style*="#43A047"], [style*="#4CAF50"], [style*="#66BB6A"],
  [style*="#81C784"], [style*="#A5D6A7"] {
    color: ${LINKHER_PINK} !important;
  }
`;

const INJECT_BEFORE_LOAD = `
  (function () {
    var style = document.createElement('style');
    style.textContent = ${JSON.stringify(REBRAND_CSS)};
    (document.head || document.documentElement).appendChild(style);
  })();
  true;
`;

const INJECT_AFTER_LOAD = `
  (function () {
    function rebrand() {
      try {
        document.title = 'LinkHer';

        var logoSvg =
          '<span style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
          'font-weight:700;font-size:1.5em;color:${LINKHER_PINK};letter-spacing:-0.02em;">LinkHer</span>';

        var imgs = document.querySelectorAll('img');
        for (var i = 0; i < imgs.length; i++) {
          var img = imgs[i];
          var src = (img.getAttribute('src') || '').toLowerCase();
          var alt = (img.getAttribute('alt') || '').toLowerCase();
          if (src.indexOf('safetea') !== -1 || alt.indexOf('safetea') !== -1) {
            var wrapper = document.createElement('span');
            wrapper.innerHTML = logoSvg;
            if (img.parentNode) {
              img.parentNode.replaceChild(wrapper, img);
            }
          }
        }

        var walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null
        );
        var node;
        while ((node = walker.nextNode())) {
          if (node.nodeValue && node.nodeValue.indexOf('SafeTea') !== -1) {
            node.nodeValue = node.nodeValue.replace(/SafeTea/g, 'LinkHer');
          }
        }
      } catch (e) {
        window.ReactNativeWebView &&
          window.ReactNativeWebView.postMessage('rebrand-error:' + e.message);
      }
    }

    if (document.readyState === 'complete') {
      rebrand();
    } else {
      window.addEventListener('load', rebrand);
    }

    var observer = new MutationObserver(function () {
      rebrand();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  })();
  true;
`;

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: 'https://getsafetea.app' }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures={true}
        injectedJavaScriptBeforeContentLoaded={INJECT_BEFORE_LOAD}
        injectedJavaScript={INJECT_AFTER_LOAD}
        onMessage={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  webview: { flex: 1 },
});
