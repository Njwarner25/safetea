import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '../../constants/colors';

const LINKHER_REBRAND_JS = `
(function() {
  // Replace SafeTea text with LinkHer throughout the page
  function rebrand() {
    // Text replacements
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if (node.nodeValue && node.nodeValue.indexOf('SafeTea') !== -1) {
        node.nodeValue = node.nodeValue.replace(/SafeTea\\+/g, 'LinkHer+').replace(/SafeTea/g, 'LinkHer');
      }
    }

    // Replace logo images
    var imgs = document.querySelectorAll('img[src*="logo"], img[alt*="SafeTea"], img[alt*="safetea"]');
    imgs.forEach(function(img) {
      img.alt = img.alt.replace(/SafeTea/g, 'LinkHer');
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
