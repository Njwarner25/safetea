import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '../../constants/colors';

const LINKHER_REBRAND_JS = `
(function() {
  var TEACUP_HOT = '☕';           // ☕ U+2615 hot beverage
  var TEACUP_PLAIN = '🍵';   // 🍵 U+1F375 teacup without handle
  var LINKHER_LOGO = 'https://getsafetea.app/images/icon-linkher.png';

  function rebrand() {
    // Text replacements: SafeTea -> LinkHer + strip legacy teacup emojis
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var v = node.nodeValue;
      if (!v) continue;
      var nv = v;
      if (nv.indexOf('SafeTea') !== -1) {
        nv = nv.replace(/SafeTea\\+/g, 'LinkHer+').replace(/SafeTea/g, 'LinkHer');
      }
      if (nv.indexOf(TEACUP_HOT) !== -1) {
        nv = nv.split(TEACUP_HOT).join('');
      }
      if (nv.indexOf(TEACUP_PLAIN) !== -1) {
        nv = nv.split(TEACUP_PLAIN).join('');
      }
      if (nv !== v) node.nodeValue = nv;
    }

    // Swap SafeTea logo images to LinkHer logo + rewrite alt text
    var imgs = document.querySelectorAll('img');
    imgs.forEach(function(img) {
      var rawSrc = img.getAttribute('src') || '';
      if (/logo\\.png/i.test(rawSrc) && (img.src || '').indexOf('icon-linkher.png') === -1) {
        img.src = LINKHER_LOGO;
      }
      if (img.alt && img.alt.indexOf('SafeTea') !== -1) {
        img.alt = img.alt.replace(/SafeTea/g, 'LinkHer');
      }
    });

    // Update page title
    if (document.title.indexOf('SafeTea') !== -1) {
      document.title = document.title.replace(/SafeTea\\+/g, 'LinkHer+').replace(/SafeTea/g, 'LinkHer');
    }

    // Update placeholder text in inputs
    var inputs = document.querySelectorAll('input[placeholder], textarea[placeholder]');
    inputs.forEach(function(input) {
      if (input.placeholder.indexOf('SafeTea') !== -1) {
        input.placeholder = input.placeholder.replace(/SafeTea/g, 'LinkHer');
      }
    });
  }

  // Run on load and on DOM changes
  rebrand();
  var observer = new MutationObserver(function() { rebrand(); });
  observer.observe(document.body, { childList: true, subtree: true });

  // Also run after short delay for dynamic content
  setTimeout(rebrand, 500);
  setTimeout(rebrand, 1500);
  setTimeout(rebrand, 3000);
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
        injectedJavaScript={LINKHER_REBRAND_JS}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  webview: { flex: 1 },
});
