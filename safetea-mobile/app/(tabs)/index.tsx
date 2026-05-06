import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '../../constants/colors';

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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  webview: { flex: 1 },
});
