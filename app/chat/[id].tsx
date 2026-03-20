import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PLACEHOLDER_AVATAR =
  "https://firebasestorage.googleapis.com/v0/b/expo2-3100a.firebasestorage.app/o/avatars%2Fk3XMvIuelxZPe2tPL8KYohOBTO23%2F1773714215426.jpg?alt=media&token=6258b7b5-a1f5-49f9-ae33-3f73745143d3";

type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp | null;
};

export default function ChatRoomScreen() {
  const { user } = useAuth();

  const params = useLocalSearchParams<{
    id?: string;
    targetUserUid?: string;
    targetUserName?: string;
    targetUserAvatar?: string;
  }>();

  const roomId = typeof params.id === "string" ? params.id : "";
  const targetUserUid =
    typeof params.targetUserUid === "string" ? params.targetUserUid : "";
  const targetUserName =
    typeof params.targetUserName === "string" ? params.targetUserName : "User";
  const targetUserAvatar =
    typeof params.targetUserAvatar === "string"
      ? params.targetUserAvatar
      : PLACEHOLDER_AVATAR;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesRef = useMemo(() => {
    if (!roomId) return null;
    return collection(db, "chats", roomId, "messages");
  }, [roomId]);

  useEffect(() => {
    if (!messagesRef) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const q = query(messagesRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => {
          const data = doc.data() as {
            text?: string;
            senderId?: string;
            createdAt?: Timestamp;
          };

          return {
            id: doc.id,
            text: data.text ?? "",
            senderId: data.senderId ?? "",
            createdAt: data.createdAt ?? null,
          };
        });

        setMessages(list);
        setLoading(false);
      },
      (error) => {
        console.error("listen messages error:", error);
        setLoading(false);
        Alert.alert("Error", "Failed to load messages.");
      },
    );

    return unsubscribe;
  }, [messagesRef]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !user?.uid || !roomId || !targetUserUid || sending) return;

    setSending(true);

    try {
      const chatRef = doc(db, "chats", roomId);
      const messageRef = doc(collection(db, "chats", roomId, "messages"));
      const batch = writeBatch(db);

      batch.set(
        chatRef,
        {
          participants: [user.uid, targetUserUid].sort(),
          participantInfo: {
            [user.uid]: {
              name: user.email?.split("@")[0] ?? "Me",
              avatar: "",
            },
            [targetUserUid]: {
              name: targetUserName,
              avatar: targetUserAvatar,
            },
          },
          lastMessage: {
            text,
            senderId: user.uid,
            createdAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      batch.set(messageRef, {
        text,
        senderId: user.uid,
        createdAt: serverTimestamp(),
      });

      await batch.commit(); // write to firestore
      setInput("");
    } catch (error) {
      console.error("send message error:", error);
      Alert.alert("Error", "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color="#007AFF" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Image source={{ uri: targetUserAvatar }} style={styles.avatar} />
          <Text style={styles.name}>{targetUserName}</Text>
        </View>

        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No messages yet.</Text>
          }
          renderItem={({ item }) => {
            const isMe = item.senderId === user?.uid;

            return (
              <View
                style={[
                  styles.bubble,
                  isMe ? styles.bubbleMe : styles.bubbleOther,
                ]}
              >
                <Text style={isMe ? styles.textMe : styles.textOther}>
                  {item.text}
                </Text>
              </View>
            );
          }}
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            style={styles.input}
            editable={!sending}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
            <Text style={styles.sendButtonText}>
              {sending ? "..." : "Send"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  backButton: {
    width: 32,
    alignItems: "flex-start",
    paddingVertical: 6,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#eee",
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    flexGrow: 1,
    paddingVertical: 8,
    gap: 8,
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    marginTop: 20,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleMe: {
    alignSelf: "flex-end",
    backgroundColor: "#007AFF",
  },
  bubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: "#E9EDF2",
  },
  textMe: {
    color: "#fff",
    fontSize: 15,
  },
  textOther: {
    color: "#111",
    fontSize: 15,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
  },
  sendButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
