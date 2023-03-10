import { findByDisplayName, findByProps, findByStoreName } from "@vendetta/metro";
import { ReactNative } from "@vendetta/metro/common";
import { after, instead } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import Settings from "./components/Settings";
import { DefaultNativeEvent, DoubleTapStateProps, Plugin, NativeEvent } from "./types";

const Chat = findByDisplayName("Chat");
const ChatInputRef = findByProps("insertText");
const MessageStore = findByStoreName("MessageStore");
const UserStore = findByStoreName("UserStore");
const Messages = findByProps("sendMessage", "startEditMessage");

const BetterChatGestures: Plugin = {
    unpatchChat: null,
    currentTapIndex: 0,

    doubleTapState({ state = "UNKNOWN", nativeEvent }: DoubleTapStateProps) {
        const stateObject = { 
            state,
            data: nativeEvent
        };

        if (state == "INCOMPLETE") {
            Object.assign(stateObject, {
                reason: {
                    required: {
                        taps: 2,
                        isAuthor: true
                    },
                    received: {
                        taps: stateObject.data.taps,
                        isAuthor: stateObject.data.isAuthor
                    }
                } 
            })
        }

        return console.log("DoubleTapState", stateObject)
    },

    onLoad() {
        // initialize
        storage.tapUsernameMention ??= ReactNative.Platform.select({
            android: false,
            ios: true,
            default: true
        })
        storage.doubleTapToEdit ??= true;

        // patch chat area to modify methods
        this.unpatchChat = after("render", Chat.prototype, (_, res) => {
            // patch username tapping to mention user instead
            res.props?.onTapUsername && instead("onTapUsername", res?.props, (args, orig) => {
                if (!storage.tapUsernameMention) return orig.apply(this, args);

                const ChatInput = ChatInputRef.refs[0].current;
                const { messageId } = args[0].nativeEvent;
    
                const message = MessageStore.getMessage(
                    ChatInput.props?.channel?.id,
                    messageId
                )
    
                if (!message) return;
                ChatInputRef.insertText(`@${message.author.username}#${message.author.discriminator}`)
            });

            // patch tapping a message to require 2 taps and author and provide edit event if both conditions are met
            res.props?.onTapMessage && instead("onTapMessage", res?.props, (args, orig) => {
                if (!storage.doubleTapToEdit) return orig.apply(this, args);

                const { nativeEvent }: { nativeEvent: DefaultNativeEvent } = args[0];
                const ChannelID = nativeEvent.channelId;
                const MessageID = nativeEvent.messageId;

                this.currentTapIndex++;
    
                let timeoutTap = setTimeout(() => {
                    this.currentTapIndex = 0;
                }, 300);
    
                const message = MessageStore.getMessage(ChannelID, MessageID);
    
                Object.assign(nativeEvent, { 
                    taps: this.currentTapIndex, 
                    content: message?.content,
                    authorId: message?.author?.id,
                    isAuthor: message?.author?.id === UserStore.getCurrentUser()?.id
                });
    
                if ((nativeEvent as NativeEvent)?.authorId !== UserStore.getCurrentUser()?.id
                    || this.currentTapIndex !== 2) return this.doubleTapState({ 
                        state: "INCOMPLETE", 
                        nativeEvent
                    });
    
                clearTimeout(timeoutTap);
                const MessageContent = (nativeEvent as NativeEvent).content;
    
                Messages.startEditMessage(
                    ChannelID,
                    MessageID,
                    MessageContent
                );

                ChatInputRef.focus();

                this.currentTapIndex = 0;
                this.doubleTapState({ 
                    state: "COMPLETE", 
                    nativeEvent 
                })
            })
        });
    },

    onUnload() {
        this.unpatchChat?.();
    },

    settings: Settings
}

export default BetterChatGestures;