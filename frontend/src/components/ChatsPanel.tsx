import React, { useState, useCallback } from 'react';
import * as Icons from 'lucide-react';
import { WorkflowAction, Connection, WorkflowVariable } from '../types/workflow';
import { v4 as uuidv4 } from 'uuid';
import { SERVICES } from '../config/services';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  // Enhanced props for canvas awareness (with defaults for safety)
  actions?: WorkflowAction[];
  connections?: Connection[];
  variables?: WorkflowVariable[];
  selectedNode?: string | null;
  onWorkflowGenerated: (workflow: {
    id: string;
    name: string;
    description: string;
    actions: WorkflowAction[];
    connections: Connection[];
    variables: WorkflowVariable[];
    version: string;
    createdAt: string;
    updatedAt: string;
  }) => void;
  onUpdateAction?: (action: WorkflowAction) => void;
  onAddAction?: (action: WorkflowAction) => void;
  onAddConnection?: (connection: Connection) => void;
  onAddVariable?: (variable: WorkflowVariable) => void;
  className?: string;
}

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: string;
  isWorkflow?: boolean;
  isNodeUpdate?: boolean;
  workflowData?: any;
  actionUpdates?: WorkflowAction[];
  connectionUpdates?: Connection[];
  variableUpdates?: WorkflowVariable[];
}

/**
 * Discriminated union returned by the local AI-response helper. The handler
 * switches on `type`; each branch carries only the fields it needs. `data` is
 * intentionally loose (the upstream AIService payload is untyped) to match the
 * existing apply flow without changing its behavior.
 */
type ChatResponse =
  | { type: 'workflow'; data: any }
  | { type: 'nodeupdate'; updates?: WorkflowAction[] }
  | {
      type: 'extendworkflow';
      newActions?: WorkflowAction[];
      newConnections?: Connection[];
      newVariables?: WorkflowVariable[];
    }
  | { type: 'analysis'; message?: string };

const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const ChatsPanel: React.FC<Props> = ({ 
  isOpen, 
  onToggle, 
  // Provide safe defaults for all props
  actions = [],
  connections = [],
  selectedNode = null,
  onWorkflowGenerated,
  onUpdateAction,
  onAddAction,
  onAddConnection,
  onAddVariable,
  className = ''
}) => {
  const [isChatActive, setIsChatActive] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  
  // 🔧 CRITICAL FIX: Isolated input state to prevent canvas re-renders
  const [localMessage, setLocalMessage] = useState('');
  const [, setNewMessage] = useState(''); // setter kept for compatibility with existing call sites
  const [isLoading, setIsLoading] = useState(false);

  const handleNewChat = useCallback(() => {
    setIsChatActive(true);
    setMessages([]);
  }, []);

  // Updated generateSmartWorkflowResponse function using AIService
  const generateSmartWorkflowResponse = useCallback(async (userMessage: string): Promise<ChatResponse> => {
    try {
      // Use the new AIService for workflow generation
      const { AIService } = await import('../services/aiService');
      
      const generatedWorkflow = await AIService.generateWorkflow(userMessage);
      
      return {
        type: 'workflow',
        data: generatedWorkflow
      };

    } catch (error) {
      console.error('Error generating smart response:', error);
      
      // Fallback: Create a basic workflow based on the request
      if (userMessage.toLowerCase().includes('folder')) {
        const folderName = userMessage.match(/folder\s+(?:named\s+)?["']?(\w+)["']?/i)?.[1] || 'NewFolder';
        const driveLetter = userMessage.match(/([A-Z]):\\/i)?.[1] || 'D';
        
        return {
          type: 'workflow',
          data: {
            id: generateUUID(),
            name: `Create Folder - ${folderName}`,
            description: `Creates a folder named ${folderName} in the ${driveLetter} drive`,
            actions: [{
              id: generateUUID(),
              type: 'create-folder',
              category: 'file-management-003',
              name: 'Create Folder',
              description: 'Creates a new folder',
              icon: 'Folder',
              api: {
                url: `${SERVICES.engineBase}/file-operations-api-1.0/api/files/operate`,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: {
                  operationType: 'createdir',
                  sourcePath: '{{folder_path}}'
                }
              },
              properties: {
                folder_path: `${driveLetter}:/${folderName}`
              },
              x: 100,
              y: 100,
              status: 'idle'
            }],
            connections: [],
            variables: [],
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        };
      }
      
      // Generic fallback
      return {
        type: 'analysis',
        message: `I understand you want to work with: "${userMessage}". Let me help you create a workflow for this task.`
      };
    }
  }, []);

  // 🔧 CRITICAL FIX: Isolated input handling
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Use local state to prevent canvas re-renders
    setLocalMessage(e.target.value);
  }, []);

  // Updated handleSendMessage function with better error handling:
  const handleSendMessage = useCallback(async () => {
    const messageToSend = localMessage.trim();
    if (!messageToSend) return;

    const userMsg: Message = {
      id: messages.length + 1,
      text: messageToSend,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setLocalMessage(''); // Clear local message
    setNewMessage(''); // Clear main message
    setIsLoading(true);

    try {
      const aiResponse = await generateSmartWorkflowResponse(messageToSend);
      let botMsg: Message;

      switch (aiResponse.type) {
        case 'workflow': {
          // Generate complete new workflow
          const workflowData = aiResponse.data;
          botMsg = {
            id: messages.length + 2,
            text: `I've created a new workflow called "${workflowData.name}" with ${workflowData.actions.length} actions. Click "Apply Workflow" to add it to your canvas.`,
            sender: 'bot',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isWorkflow: true,
            workflowData: workflowData
          };
          break;
        }

        case 'nodeupdate':
          // Update existing node properties
          botMsg = {
            id: messages.length + 2,
            text: `I've prepared property updates for ${aiResponse.updates?.length || 0} nodes. Click "Apply Updates" to modify the selected nodes with the new configurations.`,
            sender: 'bot',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isNodeUpdate: true,
            actionUpdates: aiResponse.updates
          };
          break;

        case 'extendworkflow':
          // Add new elements to existing workflow
          botMsg = {
            id: messages.length + 2,
            text: `I'll add ${aiResponse.newActions?.length || 0} new actions and ${aiResponse.newConnections?.length || 0} connections to your existing workflow. Click "Extend Workflow" to apply.`,
            sender: 'bot',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            actionUpdates: aiResponse.newActions,
            connectionUpdates: aiResponse.newConnections,
            variableUpdates: aiResponse.newVariables
          };
          break;

        case 'analysis':
          // Provide analysis or information
          botMsg = {
            id: messages.length + 2,
            text: aiResponse.message || "Here's the analysis of your current workflow state.",
            sender: 'bot',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          break;

        default:
          // Fallback to workflow creation
          botMsg = {
            id: messages.length + 2,
            text: 'I understand your request. Let me help you with your workflow automation needs.',
            sender: 'bot',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
      }

      setMessages(prev => [...prev, botMsg]);

    } catch (error: any) {
      console.error('Chat error:', error);
      
      const errorMsg: Message = {
        id: messages.length + 2,
        text: `I encountered an issue processing your request: ${error.message || error}. Please try rephrasing your request or check if the AI service is available.`,
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [localMessage, messages.length, generateSmartWorkflowResponse]);

  // 🔧 CRITICAL FIX: Isolated key press handling
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setNewMessage(localMessage);
      void handleSendMessage();
    }
  }, [handleSendMessage, localMessage]);

  const addConfirmationMessage = useCallback((text: string) => {
    const confirmMsg: Message = {
      id: Date.now(),
      text,
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, confirmMsg]);
  }, []);

  const handleApplyWorkflow = useCallback((workflowData: any) => {
    try {
      onWorkflowGenerated(workflowData);
      addConfirmationMessage('New workflow has been applied to your canvas successfully!');
    } catch (error: any) {
      console.error('Error applying workflow:', error);
      addConfirmationMessage(`Failed to apply workflow: ${error.message || 'Unknown error'}`);
    }
  }, [addConfirmationMessage, onWorkflowGenerated]);

  const handleApplyNodeUpdates = useCallback((actionUpdates: WorkflowAction[]) => {
    if (onUpdateAction) {
      try {
        actionUpdates.forEach(updatedAction => {
          const existingAction = actions.find(a => a.id === updatedAction.id);
          if (existingAction) {
            onUpdateAction({ 
              ...existingAction, 
              properties: {
                ...existingAction.properties,
                ...updatedAction.properties
              }
            });
          }
        });
        addConfirmationMessage(`Updated ${actionUpdates.length} node(s) with new properties!`);
      } catch (error: any) {
        console.error('Error updating nodes:', error);
        addConfirmationMessage(`Failed to update nodes: ${error.message || 'Unknown error'}`);
      }
    }
  }, [actions, addConfirmationMessage, onUpdateAction]);

  const handleExtendWorkflow = useCallback((newActions: WorkflowAction[], newConnections: Connection[], newVariables: WorkflowVariable[]) => {
    try {
      // Add new actions
      if (onAddAction) {
        newActions.forEach(action => {
          const newAction = { 
            ...action, 
            id: uuidv4(), 
            status: 'idle' as const,
            properties: action.properties || {}
          };
          onAddAction(newAction);
        });
      }
      
      // Add new connections
      if (onAddConnection) {
        newConnections.forEach(connection => {
          const newConnection = { ...connection, id: uuidv4() };
          onAddConnection(newConnection);
        });
      }

      // Add new variables
      if (onAddVariable) {
        newVariables.forEach(variable => {
          onAddVariable(variable);
        });
      }

      addConfirmationMessage(`Extended workflow with ${newActions.length} actions, ${newConnections.length} connections, and ${newVariables.length} variables!`);
    } catch (error: any) {
      console.error('Error extending workflow:', error);
      addConfirmationMessage(`Failed to extend workflow: ${error.message || 'Unknown error'}`);
    }
  }, [addConfirmationMessage, onAddAction, onAddConnection, onAddVariable]);

  const handleClose = useCallback(() => {
    setIsChatActive(false);
    setMessages([]);
    setLocalMessage('');
    setNewMessage('');
    onToggle();
  }, [onToggle]);

  const getContextualExamples = useCallback(() => {
    if (actions.length === 0) {
      return [
        "• \"Create a file processing workflow\"",
        "• \"Set up email automation\"",
        "• \"Build a data backup system\""
      ];
    } else if (selectedNode) {
      const selected = actions.find(a => a.id === selectedNode);
      return [
        `• "Update ${selected?.name} properties"`,
        `• "Change ${selected?.name} file path"`,
        "• \"Add validation to this node\""
      ];
    } else {
      return [
        "• \"Add error handling to workflow\"",
        "• \"Connect these nodes with conditions\"",
        "• \"Add logging to all actions\""
      ];
    }
  }, [actions, selectedNode]);

  // 🔧 CRITICAL FIX: Isolated clear function
  const handleClear = useCallback(() => {
    setMessages([]);
    setLocalMessage('');
    setNewMessage('');
  }, []);

  // 🔧 CRITICAL FIX: Isolated send button handler
  const handleSendClick = useCallback(() => {
    setNewMessage(localMessage);
    handleSendMessage();
  }, [localMessage, handleSendMessage]);

  return (
    <div className={`bg-gray-800 border-l border-gray-700 transition-all duration-300 flex flex-col ${
      isOpen ? 'w-[320px]' : 'w-0 overflow-hidden'
    } ${className}`}>
      {isOpen && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-700">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-600 rounded-lg">
                <Icons.MessageSquare className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
                {actions.length > 0 && (
                  <span className="text-xs text-gray-300">
                    {actions.length} nodes, {connections.length} connections
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
              aria-label="Close chat panel"
            >
              <Icons.X size={16} />
            </button>
          </div>

          <div className="p-3 space-y-3 overflow-y-auto flex-1">
            {!isChatActive ? (
              /* Welcome Screen */
              <>
                <button
                  onClick={handleNewChat}
                  className="flex items-center gap-2 w-full p-3 border-dashed border-2 border-gray-600 rounded-lg text-gray-400 hover:border-blue-500 hover:text-blue-400 text-sm transition-colors"
                >
                  <Icons.Plus size={16} />
                  Start Smart Chat
                </button>
                
                <div className="bg-gray-700 p-3 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icons.Brain size={16} className="text-blue-400" />
                    <span className="text-white font-medium text-sm">Context-Aware AI</span>
                  </div>
                  <p className="text-xs text-gray-300">
                    I'm aware of your current canvas state and can create, modify, or extend your workflows intelligently.
                  </p>
                  
                  {/* Canvas Status */}
                  <div className="bg-gray-800 p-2 rounded text-xs">
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>Canvas Status:</span>
                      <span className="text-white">
                        {actions.length === 0 ? 'Empty' : `${actions.length} nodes, ${connections.length} connections`}
                      </span>
                    </div>
                    {selectedNode && (
                      <div className="flex justify-between text-gray-400">
                        <span>Selected:</span>
                        <span className="text-blue-400">
                          {actions.find(a => a.id === selectedNode)?.name}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">Smart Examples:</p>
                    <ul className="text-xs text-gray-400 space-y-1">
                      {getContextualExamples().map((example, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-blue-400 mr-1">•</span>
                          <span>{example.substring(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-xs text-gray-500 pt-2 border-t border-gray-600">
                    <Icons.Shield className="w-3 h-3 inline mr-1" />
                    Only validated services will be used - no hallucination
                  </div>
                </div>
              </>
            ) : (
              /* Chat Interface */
              <>
                {/* Messages Container */}
                <div className="space-y-3 min-h-[200px] max-h-[400px] overflow-y-auto">
                  {messages.length === 0 && (
                    <div className="bg-gray-700 p-3 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Icons.Bot size={16} className="text-blue-400" />
                        <span className="text-white font-medium text-sm">AI Assistant Ready</span>
                      </div>
                      <p className="text-xs text-gray-300 mb-2">
                        I can see you have {actions.length} nodes and {connections.length} connections. {selectedNode ? ` The "${actions.find(a => a.id === selectedNode)?.name}" node is selected.` : ''}
                      </p>
                      <div className="text-xs text-gray-400">
                        <p className="mb-1">I can help you:</p>
                        <ul className="space-y-0.5 pl-3">
                          <li>• Create new workflows with validated services</li>
                          <li>• Modify existing node properties</li>
                          <li>• Add nodes to current workflow</li>
                          <li>• Analyze and optimize your setup</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {messages.map((message) => (
                    <div key={message.id} className={`p-3 rounded-lg ${
                      message.sender === 'user' ? 'bg-blue-600 ml-4' : 'bg-gray-700'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {message.sender === 'user' ? (
                            <Icons.User size={14} className="text-white" />
                          ) : (
                            <Icons.Bot size={14} className="text-blue-400" />
                          )}
                          <span className={`font-medium text-sm ${
                            message.sender === 'user' ? 'text-white' : 'text-white'
                          }`}>
                            {message.sender === 'user' ? 'You' : 'AI Assistant'}
                          </span>
                        </div>
                        <span className={`text-xs ${
                          message.sender === 'user' ? 'text-blue-200' : 'text-gray-400'
                        }`}>
                          {message.timestamp}
                        </span>
                      </div>
                      
                      <p className={`text-sm mb-2 ${
                        message.sender === 'user' ? 'text-white' : 'text-gray-300'
                      }`}>
                        {message.text}
                      </p>
                      
                      {/* Action Buttons */}
                      <div className="space-y-2">
                        {message.isWorkflow && message.workflowData && (
                          <button
                            onClick={() => handleApplyWorkflow(message.workflowData)}
                            className="w-full bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            <Icons.Download size={14} />
                            Apply Workflow
                          </button>
                        )}

                        {message.isNodeUpdate && message.actionUpdates && (
                          <button
                            onClick={() => handleApplyNodeUpdates(message.actionUpdates!)}
                            className="w-full bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            <Icons.Settings size={14} />
                            Apply Updates ({message.actionUpdates.length})
                          </button>
                        )}

                        {(message.actionUpdates || message.connectionUpdates || message.variableUpdates) && 
                         !message.isWorkflow && !message.isNodeUpdate && (
                          <button
                            onClick={() => handleExtendWorkflow(
                              message.actionUpdates || [],
                              message.connectionUpdates || [],
                              message.variableUpdates || []
                            )}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            <Icons.Plus size={14} />
                            Extend Workflow
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Loading indicator */}
                  {isLoading && (
                    <div className="bg-gray-700 p-3 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Icons.Loader2 size={14} className="text-blue-400 animate-spin" />
                        <span className="text-white font-medium text-sm">AI Processing</span>
                      </div>
                      <p className="text-xs text-gray-300">
                        Analyzing canvas and generating response...
                      </p>
                    </div>
                  )}
                </div>

                {/* Input Section */}
                <div className="bg-gray-700 p-3 rounded-lg space-y-3">
                  <textarea
                    value={localMessage} // 🔧 Use isolated local state
                    onChange={handleInputChange} // 🔧 Use isolated handler
                    onKeyPress={handleKeyPress}
                    placeholder={selectedNode 
                      ? `Modify "${actions.find(a => a.id === selectedNode)?.name}" or ask anything...`
                      : actions.length > 0 
                        ? "Modify workflow, add nodes, or ask anything..."
                        : "Create a workflow or ask anything..."
                    }
                    className="w-full px-2 py-1.5 bg-white text-black rounded border border-gray-300 focus:border-blue-500 focus:outline-none text-sm resize-none"
                    rows={2}
                    disabled={isLoading}
                  />
                  
                  <div className="flex gap-2">
                    <button
                      onClick={handleSendClick} // 🔧 Use isolated handler
                      disabled={!localMessage.trim() || isLoading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-sm"
                    >
                      {isLoading ? 'Analyzing...' : 'Send'}
                    </button>
                    
                    <button
                      onClick={handleClear} // 🔧 Use isolated handler
                      className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded text-sm"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <div className="flex items-center gap-1">
                      <Icons.Shield size={12} />
                      <span>Service validation enabled</span>
                    </div>
                    <span>Press Enter to send</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ChatsPanel;
