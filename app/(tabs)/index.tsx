import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PLACEHOLDER_AVATAR =
  "https://firebasestorage.googleapis.com/v0/b/expo2-3100a.firebasestorage.app/o/avatars%2Fk3XMvIuelxZPe2tPL8KYohOBTO23%2F1773714215426.jpg?alt=media&token=6258b7b5-a1f5-49f9-ae33-3f73745143d3";

type RegisteredUserProfile = {
  id: string;
  uid: string;
  email: string;
  nickname: string;
  avatarUrl: string;
};

type ChatListItem = {
  chatId: string;
  otherUid: string;
  name: string;
  avatar: string;
  lastMessageText: string;
  updatedAt: Timestamp | null;
};

type ChatDoc = {
  participants?: string[];
  participantInfo?: Record<string, { name?: string; avatar?: string }>;
  lastMessage?: {
    text?: string;
    senderId?: string;
    createdAt?: Timestamp | null;
  };
  updatedAt?: Timestamp | null;
};

function formatChatTime(ts: Timestamp | null) {
  if (!ts) return "";

  const date = ts.toDate();
  const now = new Date();

  const isSameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
  });
}

function createRoomId(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join("_");
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [usersModalVisible, setUsersModalVisible] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState<
    RegisteredUserProfile[]
  >([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [roomsLoading, setRoomsLoading] = useState(true);
  const [rooms, setRooms] = useState<ChatListItem[]>([]);

  useEffect(() => {
    if (!usersModalVisible || !user?.uid) return;

    setUsersLoading(true);
    const loadUsers = async () => {
      try {
        const usersCol = collection(db, "users");
        const snapshot = await getDocs(usersCol);

        const list: RegisteredUserProfile[] = snapshot.docs
          .map((d) => {
            const data = d.data() as {
              uid?: string;
              email?: string;
              nickname?: string;
              avatarUrl?: string;
            };
            const email = data.email ?? "";
            const uid = data.uid ?? d.id;
            return {
              id: d.id,
              uid,
              email,
              nickname: data.nickname ?? email.split("@")[0] ?? "User",
              avatarUrl:
                typeof data.avatarUrl === "string" ? data.avatarUrl : "",
            };
          })
          .filter((profile) => profile.uid !== user.uid);

        list.sort((a, b) =>
          a.nickname.localeCompare(b.nickname, undefined, {
            sensitivity: "base",
          }),
        );
        setRegisteredUsers(list);
      } catch (error) {
        console.error("Error fetching users:", error);
        Alert.alert(
          "Error",
          "Unable to load the user list. Please check your network connection or Firestore permissions.",
        );
      } finally {
        setUsersLoading(false);
      }
    };

    void loadUsers();
  }, [user?.uid, usersModalVisible]);

  // Real-time loading: read the redundant chats list directly (no longer assembling messages/user)
  useEffect(() => {
    if (!user?.uid) {
      setRooms([]);
      setRoomsLoading(false);
      return;
    }

    setRoomsLoading(true);

    const chatsCol = collection(db, "chats");
    const chatsQ = query(
      chatsCol,
      where("participants", "array-contains", user.uid),
      orderBy("updatedAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      chatsQ,
      (snapshot) => {
        const nextRooms: ChatListItem[] = snapshot.docs.map((docSnap) => {
          const chat = docSnap.data() as ChatDoc;

          const participants = Array.isArray(chat.participants)
            ? chat.participants
            : [];
          const otherUid =
            participants.find((p) => p !== user.uid) ??
            docSnap.id.split("_").find((p) => p !== user.uid) ??
            "";

          const otherInfo = chat.participantInfo?.[otherUid] ?? {};
          return {
            chatId: docSnap.id,
            otherUid,
            name: otherInfo.name ?? "Unknown",
            avatar: otherInfo.avatar ?? PLACEHOLDER_AVATAR,
            lastMessageText: chat.lastMessage?.text ?? "",
            updatedAt: chat.updatedAt ?? null,
          };
        });

        setRooms(nextRooms);
        setRoomsLoading(false);
      },
      (error) => {
        console.error("Listen chats error:", error);
        Alert.alert(
          "Error",
          "Unable to load the chat list in real time. Please check your Firestore permissions.",
        );
        setRoomsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const handleOpenUsers = () => {
    if (!user?.uid) {
      Alert.alert("Notice", "Please log in first");
      return;
    }
    setUsersModalVisible(true);
  };

  const handlePressUser = (targetUser: RegisteredUserProfile) => {
    if (!user?.uid) return;
    const roomId = createRoomId(user.uid, targetUser.uid);
    setUsersModalVisible(false);
    router.push({
      pathname: "/chat/[id]",
      params: {
        id: roomId,
        targetUserUid: targetUser.uid,
        targetUserName: targetUser.nickname,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity style={styles.openButton} onPress={handleOpenUsers}>
          <Text style={styles.openButtonText}>New Chat</Text>
        </TouchableOpacity>
      </View>

      {roomsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading rooms...</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.chatId}
          contentContainerStyle={styles.roomsListContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No chat rooms available</Text>
              <Text style={styles.emptySubtext}>
                Tap the top-right &quot;New Chat&quot; to get started
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const name = item.name;
            const uri =
              item.avatar && item.avatar.length > 0
                ? item.avatar
                : PLACEHOLDER_AVATAR;
            const lastText = item.lastMessageText ?? "No messages";
            const lastTime = formatChatTime(item.updatedAt);

            return (
              <TouchableOpacity
                style={styles.roomRow}
                onPress={() => {
                  router.push({
                    pathname: "/chat/[id]",
                    params: {
                      id: item.chatId,
                      targetUserUid: item.otherUid,
                      targetUserName: name,
                    },
                  });
                }}
              >
                <Image
                  source={{ uri }}
                  style={styles.roomAvatar}
                  contentFit="cover"
                  transition={200}
                />
                <View style={styles.roomMeta}>
                  <View style={styles.roomTopRow}>
                    <Text style={styles.roomName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.roomTime}>{lastTime}</Text>
                  </View>
                  <Text style={styles.roomLastMessage} numberOfLines={1}>
                    {lastText}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal
        visible={usersModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setUsersModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Registered Users</Text>
              <TouchableOpacity
                onPress={() => setUsersModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            {usersLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.modalLoadingText}>Loading...</Text>
              </View>
            ) : (
              <FlatList
                data={registeredUsers}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.usersListContent}
                ListEmptyComponent={
                  <Text style={styles.usersEmpty}>
                    No available users to chat with
                  </Text>
                }
                renderItem={({ item }) => {
                  const uri =
                    item.avatarUrl && item.avatarUrl.length > 0
                      ? item.avatarUrl
                      : PLACEHOLDER_AVATAR;
                  return (
                    <TouchableOpacity
                      style={styles.userRow}
                      onPress={() => handlePressUser(item)}
                    >
                      <Image
                        source={{ uri }}
                        style={styles.userAvatar}
                        contentFit="cover"
                        transition={200}
                      />
                      <View style={styles.userMeta}>
                        <Text style={styles.userName} numberOfLines={1}>
                          {item.nickname}
                        </Text>
                        {item.email ? (
                          <Text style={styles.userEmail} numberOfLines={1}>
                            {item.email}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111",
  },
  openButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
  },
  openButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#666",
  },
  roomsListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
    gap: 12,
  },
  roomAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#f0f0f0",
  },
  roomMeta: {
    flex: 1,
    minWidth: 0,
  },
  roomTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  roomTime: {
    fontSize: 12,
    color: "#999",
    marginLeft: 8,
  },
  roomName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  roomLastMessage: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 40,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 13,
    color: "#666",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "72%",
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },
  modalClose: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "600",
  },
  modalLoading: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },
  modalLoadingText: {
    fontSize: 15,
    color: "#666",
  },
  usersListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  usersEmpty: {
    textAlign: "center",
    color: "#999",
    paddingVertical: 32,
    fontSize: 15,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
    gap: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f0f0f0",
  },
  userMeta: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
  },
  userEmail: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
});
