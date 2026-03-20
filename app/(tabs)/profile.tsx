import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/firebase";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type UserProfile = {
  uid: string;
  email: string;
  nickname: string;
  avatarUrl?: string;
  createdAt: Timestamp;
};

const PLACEHOLDER_AVATAR =
  "https://firebasestorage.googleapis.com/v0/b/expo2-3100a.firebasestorage.app/o/avatars%2Fk3XMvIuelxZPe2tPL8KYohOBTO23%2F1773714215426.jpg?alt=media&token=6258b7b5-a1f5-49f9-ae33-3f73745143d3";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  const userDocRef = useMemo(() => {
    if (!user?.uid) return null;
    return doc(db, "users", user.uid);
  }, [user?.uid]);
  // usememo to avoid re-creating the ref on every render

  useEffect(() => {
    if (!user || !userDocRef) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      userDocRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          // better choice : use cloud function to create the user profile
          const createdAt = Timestamp.now();
          const initialData: UserProfile = {
            uid: user.uid,
            email: user.email ?? "",
            nickname: user.email?.split("@")[0] ?? "New User",
            avatarUrl: "",
            createdAt,
          };
          await setDoc(
            userDocRef,
            { ...initialData, createdAt: serverTimestamp() },
            { merge: true },
          );
          setProfile(initialData);
          setNickname(initialData.nickname);
          setLoading(false);
          return;
        }

        const data = snapshot.data() as Partial<UserProfile>;
        const createdAt =
          data.createdAt instanceof Timestamp
            ? data.createdAt
            : Timestamp.now();
        const currentProfile: UserProfile = {
          uid: user.uid,
          email: data.email ?? user.email ?? "",
          nickname: data.nickname ?? user.email?.split("@")[0] ?? "New User",
          avatarUrl: data.avatarUrl ?? "",
          createdAt,
        };
        setProfile(currentProfile);
        setNickname(currentProfile.nickname);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading profile:", error);
        Alert.alert("Error", "Failed to load profile");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [user, userDocRef]);

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
            // router.replace("/login");
          } catch (error) {
            console.error("Error logging out:", error);
            Alert.alert("Error", "Logout failed");
          }
        },
      },
    ]);
  };

  const handleSaveNickname = async () => {
    if (!userDocRef) return;
    const trimmed = nickname.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Nickname cannot be empty");
      return;
    }

    try {
      setSaving(true);
      await updateDoc(userDocRef, {
        nickname: trimmed,
        updatedAt: serverTimestamp(),
      });
      Alert.alert("Success", "Profile updated");
    } catch (error) {
      console.error("Error updating nickname:", error);
      Alert.alert("Error", "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handlePickAndUploadAvatar = async () => {
    if (!user || !userDocRef) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Please allow photo library access");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled || !result.assets[0]?.uri) return;

      setUploadingAvatar(true);
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const avatarRef = ref(storage, `avatars/${user.uid}/${Date.now()}.jpg`);
      await uploadBytes(avatarRef, blob);
      const avatarUrl = await getDownloadURL(avatarRef);

      await updateDoc(userDocRef, {
        avatarUrl,
        updatedAt: serverTimestamp(),
      });

      setAvatarModalVisible(false);
      Alert.alert("Success", "Avatar updated");
    } catch (error) {
      console.error("Error uploading avatar:", error);
      Alert.alert("Error", "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.errorText}>No user profile found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={() => setAvatarModalVisible(true)}
            activeOpacity={0.85}
          >
            <Image
              source={profile.avatarUrl || PLACEHOLDER_AVATAR}
              style={styles.avatar}
              contentFit="cover"
              transition={200}
            />
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>

          <Text style={styles.hintText}>Tap avatar to upload new photo</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nickname</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="Enter nickname"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, styles.disabledInput]}
              value={profile.email}
              editable={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            disabled={saving}
            onPress={handleSaveNickname}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Profile</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={avatarModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAvatarModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setAvatarModalVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
          >
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Avatar</Text>
                  <TouchableOpacity
                    onPress={() => setAvatarModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color="#111" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    uploadingAvatar && styles.buttonDisabled,
                  ]}
                  onPress={handlePickAndUploadAvatar}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonText}>
                      Choose Photo and Upload
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    gap: 10,
  },
  loadingText: {
    color: "#666",
    fontSize: 15,
  },
  errorText: {
    color: "#d00",
    fontSize: 15,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },
  profileCard: {
    backgroundColor: "#f8f8f8",
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ececec",
  },
  avatarWrapper: {
    alignSelf: "center",
    marginBottom: 10,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#ddd",
  },
  avatarEditBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007AFF",
    borderWidth: 2,
    borderColor: "#fff",
  },
  hintText: {
    textAlign: "center",
    color: "#666",
    marginBottom: 18,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#111",
  },
  disabledInput: {
    backgroundColor: "#f0f0f0",
    color: "#777",
  },
  saveButton: {
    marginTop: 8,
    backgroundColor: "#007AFF",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  modalButton: {
    backgroundColor: "#007AFF",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
