import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp | null;
};

export default function ChatRoomScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    roomId?: string;
    peerUid?: string;
    peerName?: string;
  }>();
  const roomId = typeof params.roomId === "string" ? params.roomId : "";
  const peerUid = typeof params.peerUid === "string" ? params.peerUid : "";
  const peerName = typeof params.peerName === "string" ? params.peerName : "用户";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [roomReady, setRoomReady] = useState(false);

  const messagesRef = useMemo(() => {
    if (!roomId) return null;
    return collection(db, "chats", roomId, "messages");
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !messagesRef) {
      setMessages([]);
      setLoading(false);
      return;
    }

    if (!roomReady) {
      setMessages([]);
      setLoading(true);
      return;
    }

    setLoading(true);

    const q = query(messagesRef, orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => {
          const data = d.data() as {
            text?: string;
            senderId?: string;
            createdAt?: Timestamp;
          };
          return {
            id: d.id,
            text: data.text ?? "",
            senderId: data.senderId ?? "",
            createdAt: data.createdAt ?? null,
          };
        });
        setMessages(list);
        setChatError("");
        setLoading(false);
      },
      (error) => {
        console.error("Listen messages error:", error);
        setChatError("无权限读取消息，请检查 Firestore 规则");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [messagesRef, roomId, roomReady]);

  useEffect(() => {
    if (!user?.uid || !roomId || !peerUid) return;

    const ensureRoom = async () => {
      try {
        setLoading(true);
        setRoomReady(false);
        setChatError("");

        const [meSnap, peerSnap] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          getDoc(doc(db, "users", peerUid)),
        ]);

        const meData = meSnap.exists()
          ? (meSnap.data() as {
              nickname?: string;
              avatarUrl?: string;
            })
          : null;
        const peerData = peerSnap.exists()
          ? (peerSnap.data() as {
              nickname?: string;
              avatarUrl?: string;
            })
          : null;

        const meName =
          meData?.nickname ?? user.email?.split("@")[0] ?? "Me";
        const meAvatar =
          typeof meData?.avatarUrl === "string" ? meData.avatarUrl : "";

        const resolvedPeerName = peerData?.nickname ?? peerName;
        const resolvedPeerAvatar =
          typeof peerData?.avatarUrl === "string" ? peerData.avatarUrl : "";

        await setDoc(
          doc(db, "chats", roomId),
          {
            participants: [user.uid, peerUid].sort(),
            participantInfo: {
              [user.uid]: { name: meName, avatar: meAvatar },
              [peerUid]: { name: resolvedPeerName, avatar: resolvedPeerAvatar },
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        setRoomReady(true);
      } catch (error) {
        console.error("Create chatroom failed:", {
          error,
          roomId,
          myUid: user.uid,
          peerUid,
        });
        setChatError("无法创建聊天室：权限不足，请先更新 Firestore 规则");
        setRoomReady(false);
        setLoading(false);
      }
    };

    void ensureRoom();
  }, [peerUid, roomId, user?.uid, user?.email, peerName]);

  const sendMessage = async () => {
    if (sending) return;
    const content = input.trim();
    if (!content || !user?.uid || !roomId || !messagesRef) return;
    if (!roomReady) {
      Alert.alert("聊天室不可用", "房间尚未创建成功，请检查 Firestore 规则");
      return;
    }

    setSending(true);
    try {
      const chatRef = doc(db, "chats", roomId);
      const messageRef = doc(collection(db, "chats", roomId, "messages"));
      const batch = writeBatch(db);

      // 先更新 chats 的冗余字段（首页只读 chats）
      batch.set(
        chatRef,
        {
          lastMessage: {
            text: content,
            senderId: user.uid,
            createdAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 再写入 messages 明细
      batch.set(messageRef, {
        text: content,
        senderId: user.uid,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      setInput("");
      setChatError("");
    } catch (error) {
      console.error("Send message failed:", error);
      setChatError("发送失败：权限不足或网络异常");
      Alert.alert("发送失败", "请检查 Firestore 规则后重试");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>与 {peerName} 的聊天</Text>
      {chatError ? <Text style={styles.errorText}>{chatError}</Text> : null}

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
            <Text style={styles.emptyText}>还没有消息，发一条开始聊天</Text>
          }
          renderItem={({ item }) => {
            const isMe = item.senderId === user?.uid;
            return (
              <View
                style={[
                  styles.messageBubble,
                  isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
                ]}
              >
                <Text
                  style={[
                    styles.messageSender,
                    isMe ? styles.messageSenderMe : styles.messageSenderOther,
                  ]}
                >
                  {isMe ? "我" : peerName}
                </Text>
                <Text
                  style={[
                    styles.messageText,
                    isMe ? styles.messageTextMe : styles.messageTextOther,
                  ]}
                >
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
            placeholder="输入消息..."
            style={styles.input}
            editable={!sending}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={styles.sendButton}
            onPress={sendMessage}
            disabled={sending}
          >
            <Text style={styles.sendButtonText}>{sending ? "发送中" : "发送"}</Text>
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
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginBottom: 12,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    gap: 8,
    paddingVertical: 8,
    flexGrow: 1,
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    marginTop: 20,
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageBubbleMe: {
    alignSelf: "flex-end",
    backgroundColor: "#007AFF",
  },
  messageBubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: "#E9EDF2",
  },
  messageSender: {
    fontSize: 11,
    marginBottom: 2,
  },
  messageSenderMe: {
    color: "rgba(255,255,255,0.85)",
  },
  messageSenderOther: {
    color: "#666",
  },
  messageText: {
    fontSize: 15,
  },
  messageTextMe: {
    color: "#fff",
  },
  messageTextOther: {
    color: "#111",
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
  errorText: {
    color: "#D93025",
    marginBottom: 8,
    fontSize: 13,
  },
});
